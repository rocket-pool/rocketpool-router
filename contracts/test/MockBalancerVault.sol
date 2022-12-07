// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "../lib/@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "./MockRETH.sol";
import "./MockWETH.sol";

contract MockBalancerVault {
    event Swap(IVault.SingleSwap swap, IVault.FundManagement funds, uint256 limit, uint256 deadline);

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

    function swap(IVault.SingleSwap memory singleSwap, IVault.FundManagement memory funds, uint256 limit, uint256 deadline) external payable returns (uint256) {
        emit Swap(singleSwap, funds, limit, deadline);

        if (address(singleSwap.assetOut) == address(reth)) {
            uint256 amountOut = singleSwap.amount * rate / 1 ether;
            reth.mint(funds.recipient, amountOut);
            return amountOut;
        } else {
            uint256 amountOut = singleSwap.amount * 1 ether / rate;
            weth.mint(funds.recipient, amountOut);
            return amountOut;
        }
    }
}
