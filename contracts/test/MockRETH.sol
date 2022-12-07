// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockRETH is ERC20 {
    event Burn(uint256 amount);

    uint256 rate;
    uint256 totalCollateral;

    constructor() ERC20("Rocket Pool ETH", "rETH"){
        rate = 1 ether;
        totalCollateral = 0;
    }

    receive() external payable {}

    function setRate(uint256 _rate) external {
        rate = _rate;
    }

    function mint(address _to, uint256 _amount) external payable {
        _mint(_to, _amount);
    }

    function setTotalCollateral(uint256 _collateral) external {
        totalCollateral = _collateral;
    }

    function getTotalCollateral() external view returns (uint256) {
        return totalCollateral;
    }

    function burn(uint256 _rethAmount) external {
        emit Burn(_rethAmount);
        _burn(msg.sender, _rethAmount);
        payable(msg.sender).transfer(getEthValue(_rethAmount));
    }

    function getEthValue(uint256 _rethAmount) public view returns (uint256) {
        return (_rethAmount * 1 ether / rate);
    }

    function getRethValue(uint256 _ethAmount) external view returns (uint256) {
        return (_ethAmount * rate / 1 ether);
    }
}
