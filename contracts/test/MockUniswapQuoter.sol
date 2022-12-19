// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./MockRETH.sol";
import "./MockWETH.sol";

contract MockUniswapQuoter {
    event Quote(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn);

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

    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint24 fee,
        uint256 amountIn,
        uint160 sqrtPriceLimitX96
    ) external returns (uint256 amountOut) {
        emit Quote(tokenIn, tokenOut, fee, amountIn);

        if (tokenOut == address(reth)) {
            uint256 amountOut = amountIn * rate / 1 ether;
            return amountOut;
        } else {
            uint256 amountOut = amountIn * 1 ether / rate;
            return amountOut;
        }
    }
}
