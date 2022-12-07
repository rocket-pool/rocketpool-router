// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRETH is ERC20 {
    constructor() ERC20("Rocket Pool ETH", "rETH"){
    }

    function mint(address _to, uint256 _amount) external payable {
        _mint(_to, _amount);
    }
}
