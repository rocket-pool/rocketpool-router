// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./MockRETH.sol";
import "./MockWETH.sol";

contract MockUniswapRouter {
    event Swap(ISwapRouter.ExactInputSingleParams evt);

    uint256 rate;
    MockRETH reth;
    MockWETH weth;

    constructor(MockRETH _reth, MockWETH _weth) {
        reth = _reth;
        weth = _weth;
        rate = 1 ether;
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        emit Swap(params);

        if (params.tokenOut == address(reth)) {
            uint256 amountOut = params.amountIn * rate / 1 ether;
            reth.mint(params.recipient, amountOut);
            return amountOut;
        } else {
            uint256 amountOut = params.amountIn * 1 ether / rate;
            weth.mint(params.recipient, amountOut);
            return amountOut;
        }
    }
}
