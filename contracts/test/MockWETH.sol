// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../lib/@balancer-labs/v2-interfaces/contracts/solidity-utils/misc/IWETH.sol";

contract MockWETH is ERC20, IWETH {
    constructor() ERC20("Wrapped ETH", "WETH"){
    }

    function deposit() override external payable {
        _mint(msg.sender, msg.value);
    }

    function withdraw(uint256 _amount) external {
        _burn(msg.sender, _amount);
        payable(msg.sender).transfer(_amount);
    }
}
