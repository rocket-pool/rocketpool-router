// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import "./lib/@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "./lib/@balancer-labs/v2-interfaces/contracts/solidity-utils/misc/IWETH.sol";

import "./interface/RocketStorageInterface.sol";
import "./interface/RocketDepositPool.sol";
import "./interface/RocketDAOProtocolSettingsDepositInterface.sol";
import "./interface/IrETH.sol";

/// @notice Routes swaps through Uniswap and Balancer liquidity sources
contract RocketSwapRouter {
    // Rocket Pool immutables
    RocketStorageInterface immutable rocketStorage;
    uint256 constant DEPOSIT_POOL_THRESHOLD = 0.01 ether;

    // Uniswap immutables
    ISwapRouter public immutable uniswapRouter;
    uint24 immutable uniswapPoolFee;

    // Balance immutables
    IVault public immutable balancerVault;
    bytes32 public immutable balancerPoolId;

    // Token addresses
    IrETH public immutable rETH;
    IWETH public immutable WETH;

    // Errors
    error LessThanMinimum(uint256 amountOut);
    error TransferFailed();

    /// @param _rocketStorage Address of Rocket Pool's main RocketStorage contract
    /// @param _wethAddress Address of WETH token
    /// @param _uniswapRouter Address of UniswapV2Router02
    /// @param _uniswapPoolFee The fee to identify which Uniswap pool to use
    /// @param _balancerVault Address of Balancer's vault contract
    /// @param _balancerPoolId ID of the liquidity pool on balancer to use
    constructor(address _rocketStorage, address _wethAddress, address _uniswapRouter, uint24 _uniswapPoolFee, address _balancerVault, bytes32 _balancerPoolId) {
        rocketStorage = RocketStorageInterface(_rocketStorage);
        rETH = IrETH(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketTokenRETH"))));
        WETH = IWETH(_wethAddress);

        uniswapRouter = ISwapRouter(_uniswapRouter);
        uniswapPoolFee = _uniswapPoolFee;

        balancerVault = IVault(_balancerVault);
        balancerPoolId = _balancerPoolId;
    }

    receive() external payable {}

    /// @notice Executes a swap of ETH to rETH
    /// @param _uniswapPortion The portion to swap via Uniswap
    /// @param _balancerPortion The portion to swap via Balancer
    /// @param _minTokensOut Swap will revert if at least this amount of rETH is not output
    /// @param _idealTokensOut If the protocol can provide a better swap than this, it will swap as much as possible that way
    function swapTo(uint256 _uniswapPortion, uint256 _balancerPortion, uint256 _minTokensOut, uint256 _idealTokensOut) external payable {
        // Get addresses from Rocket Pool
        RocketDepositPoolInterface depositPool = RocketDepositPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDepositPool"))));
        RocketDAOProtocolSettingsDepositInterface depositSettings = RocketDAOProtocolSettingsDepositInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsDeposit"))));

        // Record balance before the swap
        uint256 balanceBefore = rETH.balanceOf(msg.sender);

        uint256 toExchange = msg.value;
        uint256 toDepositPool = 0;

        // Check in-protocol mint rate
        if (rETH.getRethValue(msg.value) >= _idealTokensOut) {
            // Query deposit pool settings
            bool depositPoolEnabled = depositSettings.getDepositEnabled();

            // If deposits are enabled, work out how much space there is and subtract that from amount swapping on exchanges
            if (depositPoolEnabled) {
                uint256 depositPoolBalance = depositPool.getBalance();
                uint256 maxDepositBalance = depositSettings.getMaximumDepositPoolSize();

                if (depositPoolBalance < maxDepositBalance) {
                    uint256 minDeposit = depositSettings.getMinimumDeposit();

                    toDepositPool = maxDepositBalance - depositPoolBalance;
                    if (toDepositPool > msg.value) {
                        toDepositPool = msg.value;
                    }

                    // Check deposit pool minimum deposit amount
                    if (toDepositPool < minDeposit) {
                        toDepositPool = 0;
                    } else {
                        toExchange = toExchange - toDepositPool;
                    }
                }
            }
        }

        // Calculate splits
        uint256 totalPortions = _uniswapPortion + _balancerPortion;
        uint256 toUniswap = toExchange * _uniswapPortion / totalPortions;
        uint256 toBalancer = toExchange - toUniswap;

        // Convert toExchange ETH to WETH
        WETH.deposit{value: toExchange}();

        // Execute swaps
        uniswapSwap(toUniswap, address(WETH), address(rETH), msg.sender);
        balancerSwap(toBalancer, address(WETH), address(rETH), payable(msg.sender));
        depositPoolDeposit(depositPool, toDepositPool, msg.sender);

        // Verify minimum out
        uint256 balanceAfter = rETH.balanceOf(msg.sender);
        uint256 amountOut = balanceAfter - balanceBefore;
        if (amountOut < _minTokensOut) {
            revert LessThanMinimum(amountOut);
        }
    }

    /// @notice Executes a swap of rETH to ETH. User should approve this contract to spend their rETH before calling.
    /// @param _uniswapPortion The portion to swap via Uniswap
    /// @param _balancerPortion The portion to swap via Balancer
    /// @param _minTokensOut Swap will revert if at least this amount of ETH is not output
    /// @param _idealTokensOut If the protocol can provide a better swap than this, it will swap as much as possible that way
    function swapFrom(uint256 _uniswapPortion, uint256 _balancerPortion, uint256 _minTokensOut, uint256 _idealTokensOut, uint256 _tokensIn) external {
        // Get addresses from Rocket Pool
        RocketDepositPoolInterface depositPool = RocketDepositPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDepositPool"))));
        RocketDAOProtocolSettingsDepositInterface depositSettings = RocketDAOProtocolSettingsDepositInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsDeposit"))));

        // Record balance before the swap
        uint256 balanceBefore = msg.sender.balance;

        uint256 toExchange = _tokensIn;
        uint256 toBurn = 0;

        // Check in-protocol burn rate
        if (rETH.getEthValue(_tokensIn) >= _idealTokensOut) {
            uint256 totalCollateral = rETH.getTotalCollateral();
            if (totalCollateral > 0) {
                if (_tokensIn > totalCollateral) {
                    toBurn = totalCollateral;
                    toExchange = _tokensIn - toBurn;
                } else {
                    toBurn = _tokensIn;
                    toExchange = 0;
                }
            }
        }

        // Calculate splits
        uint256 totalPortions = _uniswapPortion + _balancerPortion;
        uint256 toUniswap = toExchange * _uniswapPortion / totalPortions;
        uint256 toBalancer = toExchange - toUniswap;

        // Collect tokens
        rETH.transferFrom(msg.sender, address(this), _tokensIn);

        // Execute swaps
        uniswapSwap(toUniswap, address(rETH), address(WETH), address(this));
        balancerSwap(toBalancer, address(rETH), address(WETH), payable(this));
        rethBurn(toBurn);

        // Convert WETH back to ETH
        WETH.withdraw(WETH.balanceOf(address(this)));
        (bool result, ) = msg.sender.call{value: address(this).balance}("");
        if (!result) {
            revert TransferFailed();
        }

        // Verify minimum out
        uint256 balanceAfter = msg.sender.balance;
        uint256 amountOut = balanceAfter - balanceBefore;
        if (amountOut < _minTokensOut) {
            revert LessThanMinimum(amountOut);
        }
    }

    /// @dev Perform a swap via Rocket Pool deposit pool
    /// @param _depositPool Instance of the deposit pool
    /// @param _amount Amount of ETH to deposit
    /// @param _recipient Recipient of the minted rETH tokens
    function depositPoolDeposit(RocketDepositPoolInterface _depositPool, uint256 _amount, address _recipient) private {
        if (_amount == 0) {
            return;
        }

        _depositPool.deposit{value : _amount}();

        if (_recipient != address(this)) {
            uint256 rETHBalance = rETH.balanceOf(address(this));
            rETH.transfer(_recipient, rETHBalance);
        }
    }

    /// @dev Perform a burn of rETH via Rocket Pool
    /// @param _amount Amount of rETH to burn
    function rethBurn(uint256 _amount) private {
        if (_amount == 0) {
            return;
        }

        rETH.burn(_amount);
    }

    /// @dev Perform a swap via Uniswap
    /// @param _amount Amount of ETH to swap
    /// @param _from The token input
    /// @param _to The token output
    /// @param _recipient The recipient of the output tokens
    function uniswapSwap(uint256 _amount, address _from, address _to, address _recipient) private {
        if (_amount == 0) {
            return;
        }

        // Perform swap (don't care about amountOutMinimum here as we check overall slippage at end)
        ISwapRouter.ExactInputSingleParams memory params =
        ISwapRouter.ExactInputSingleParams({
            tokenIn : _from,
            tokenOut : _to,
            fee : uniswapPoolFee,
            recipient : _recipient,
            deadline : block.timestamp,
            amountIn : _amount,
            amountOutMinimum : 0,
            sqrtPriceLimitX96 : 0
        });

        // Approve the router to spend our WETH
        TransferHelper.safeApprove(_from, address(uniswapRouter), _amount);

        // The call to `exactInputSingle` executes the swap.
        uniswapRouter.exactInputSingle(params);
    }

    /// @dev Perform a swap via Balancer
    /// @param _amount Amount of ETH to swap
    /// @param _from The token input
    /// @param _to The token output
    /// @param _recipient The recipient of the output tokens
    function balancerSwap(uint256 _amount, address _from, address _to, address payable _recipient) private {
        if (_amount == 0) {
            return;
        }

        IVault.SingleSwap memory swap;
        swap.poolId = balancerPoolId;
        swap.kind = IVault.SwapKind.GIVEN_IN;
        swap.assetIn = IAsset(_from);
        swap.assetOut = IAsset(_to);
        swap.amount = _amount;

        IVault.FundManagement memory fundManagement;
        fundManagement.sender = address(this);
        fundManagement.recipient = _recipient;
        fundManagement.fromInternalBalance = false;
        fundManagement.toInternalBalance = false;

        // Approve the vault to spend our WETH
        TransferHelper.safeApprove(_from, address(balancerVault), _amount);

        // Execute swap
        balancerVault.swap(swap, fundManagement, 0, block.timestamp);
    }
}
