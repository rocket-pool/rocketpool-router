// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

contract MockDepositSettings {
    bool depositEnabled;
    uint256 maximumDepositPoolSize;

    function getDepositEnabled() external view returns (bool) {
        return depositEnabled;
    }

    function setDepositEnabled(bool _depositEnabled) external {
        depositEnabled = _depositEnabled;
    }

    function getMaximumDepositPoolSize() external view returns (uint256) {
        return maximumDepositPoolSize;
    }

    function setMaximumDepositPoolSize(uint256 _maximumDepositPoolSize) external {
        maximumDepositPoolSize = _maximumDepositPoolSize;
    }

    function getMinimumDeposit() external view returns (uint256) {
        return 0.01 ether;
    }
}
