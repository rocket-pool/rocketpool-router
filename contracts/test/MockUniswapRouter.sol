// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import '@uniswap/v3-periphery/contracts/interfaces/ISwapRouter.sol';
import "./MockRETH.sol";

contract MockUniswapRouter {
    event Swap(ISwapRouter.ExactInputSingleParams evt);

    uint256 rate;
    MockRETH reth;

    constructor(MockRETH _reth) {
        reth = _reth;
        rate = 1 ether;
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function exactInputSingle(ISwapRouter.ExactInputSingleParams calldata params) external payable returns (uint256 amountOut) {
        emit Swap(params);
        uint256 amountOut = params.amountIn * rate / 1 ether;
        reth.mint(params.recipient, amountOut);
        return amountOut;
    }
}
