// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

contract MockRocketStorage {
    mapping(bytes32 => address) public addresses;

    constructor() {
    }

    function getAddress(bytes32 _key) external view returns (address) {
        return addresses[_key];
    }

    function setAddress(string memory _name, address _value) external {
        bytes32 key = keccak256(abi.encodePacked("contract.address", _name));
        addresses[key] = _value;
    }
}
