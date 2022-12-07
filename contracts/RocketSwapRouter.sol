// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import '@uniswap/v3-periphery/contracts/libraries/TransferHelper.sol';

import "./lib/@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "./lib/@balancer-labs/v2-interfaces/contracts/solidity-utils/misc/IWETH.sol";

import "./interface/RocketStorageInterface.sol";
import "./interface/RocketDepositPool.sol";
import "./interface/RocketDAOProtocolSettingsDepositInterface.sol";

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
    IERC20 public immutable rETH;
    IWETH public immutable WETH;

    // Errors
    error LessThanMinimum(uint256 amountOut);

    /// @param _rocketStorage Address of Rocket Pool's main RocketStorage contract
    /// @param _wethAddress Address of WETH token
    /// @param _uniswapRouter Address of UniswapV2Router02
    /// @param _uniswapPoolFee The fee to identify which Uniswap pool to use
    /// @param _balancerVault Address of Balancer's vault contract
    /// @param _balancerPoolId ID of the liquidity pool on balancer to use
    constructor(address _rocketStorage, address _wethAddress, address _uniswapRouter, uint24 _uniswapPoolFee, address _balancerVault, bytes32 _balancerPoolId) {
        rocketStorage = RocketStorageInterface(_rocketStorage);
        rETH = IERC20(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketTokenRETH"))));
        WETH = IWETH(_wethAddress);

        uniswapRouter = ISwapRouter(_uniswapRouter);
        uniswapPoolFee = _uniswapPoolFee;

        balancerVault = IVault(_balancerVault);
        balancerPoolId = _balancerPoolId;
    }

    /// @notice Executes a swap of ETH to rETH
    /// @param _uniswapPortion The portion to swap via Uniswap
    /// @param _balancerPortion The portion to swap via Balancer
    /// @param _minTokensOut Swap will revert if at least this amount of rETH is not output
    function swap(uint256 _uniswapPortion, uint256 _balancerPortion, uint256 _minTokensOut) external payable {
        // Get addresses from Rocket Pool
        RocketDepositPoolInterface depositPool = RocketDepositPoolInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDepositPool"))));
        RocketDAOProtocolSettingsDepositInterface depositSettings = RocketDAOProtocolSettingsDepositInterface(rocketStorage.getAddress(keccak256(abi.encodePacked("contract.address", "rocketDAOProtocolSettingsDeposit"))));

        // Record balance before the swap
        uint256 balanceBefore = rETH.balanceOf(msg.sender);

        uint256 toExchange = msg.value;
        uint256 toDepositPool = 0;

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

        // Calculate splits
        uint256 totalPortions = _uniswapPortion + _balancerPortion;
        uint256 toUniswap = toExchange * _uniswapPortion / totalPortions;
        uint256 toBalancer = toExchange - toUniswap;

        // Convert toExchange ETH to WETH
        WETH.deposit{value: toExchange}();

        // Execute swaps
        uniswapSwap(toUniswap);
        balancerSwap(toBalancer);
        depositPoolSwap(depositPool, toDepositPool);

        // Verify minimum out
        uint256 balanceAfter = rETH.balanceOf(msg.sender);
        uint256 amountOut = balanceAfter - balanceBefore;
        if (amountOut < _minTokensOut) {
            revert LessThanMinimum(amountOut);
        }
    }

    /// @dev Perform a swap via Rocket Pool deposit pool
    /// @param _depositPool Instance of the deposit pool
    /// @param _amount Amount of ETH to deposit
    function depositPoolSwap(RocketDepositPoolInterface _depositPool, uint256 _amount) private {
        if (_amount == 0) {
            return;
        }

        _depositPool.deposit{value : _amount}();
        uint256 rETHBalance = rETH.balanceOf(address(this));
        rETH.transfer(msg.sender, rETHBalance);
    }

    /// @dev Perform a swap via Uniswap
    /// @param _amount Amount of ETH to swap
    function uniswapSwap(uint256 _amount) private {
        if (_amount == 0) {
            return;
        }

        // Perform swap (don't care about amountOutMinimum here as we check overall slippage at end)
        ISwapRouter.ExactInputSingleParams memory params =
        ISwapRouter.ExactInputSingleParams({
            tokenIn : address(WETH),
            tokenOut : address(rETH),
            fee : uniswapPoolFee,
            recipient : msg.sender,
            deadline : block.timestamp,
            amountIn : _amount,
            amountOutMinimum : 0,
            sqrtPriceLimitX96 : 0
        });

        // Approve the router to spend our WETH
        TransferHelper.safeApprove(address(WETH), address(uniswapRouter), _amount);

        // The call to `exactInputSingle` executes the swap.
        uniswapRouter.exactInputSingle(params);
    }

    /// @dev Perform a swap via Balancer
    /// @param _amount Amount of ETH to swap
    function balancerSwap(uint256 _amount) private {
        if (_amount == 0) {
            return;
        }

        IVault.SingleSwap memory swap;
        swap.poolId = balancerPoolId;
        swap.kind = IVault.SwapKind.GIVEN_IN;
        swap.assetIn = IAsset(address(WETH));
        swap.assetOut = IAsset(address(rETH));
        swap.amount = _amount;

        IVault.FundManagement memory fundManagement;
        fundManagement.sender = address(this);
        fundManagement.recipient = payable(msg.sender);
        fundManagement.fromInternalBalance = false;
        fundManagement.toInternalBalance = false;

        // Approve the vault to spend our WETH
        TransferHelper.safeApprove(address(WETH), address(balancerVault), _amount);

        // Execute swap
        balancerVault.swap(swap, fundManagement, 0, block.timestamp);
    }
}
