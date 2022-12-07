// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "./MockRETH.sol";

contract MockDepositPool {
    event Deposit(uint256 amount);

    uint256 rate;
    uint256 balance;
    MockRETH reth;

    constructor(MockRETH _reth) {
        reth = _reth;
        rate = 1 ether;
    }

    function deposit() external payable {
        emit Deposit(msg.value);
        reth.mint(msg.sender, msg.value * rate / 1 ether);
    }

    function getBalance() external view returns (uint256) {
        return balance;
    }

    function setBalance(uint256 _balance) external {
        balance = _balance;
    }

    function setRate(uint256 _rate) external {
        rate = _rate;
    }
}
