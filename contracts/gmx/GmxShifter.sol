//SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../tokens/MintableBaseToken.sol";
import "../libraries/utils/ReentrancyGuard.sol";

contract GmxShifter is ReentrancyGuard {
    address public immutable from;
    address public immutable to;
    address public immutable admin;
    address public immutable gmx;

    modifier onlyAdmin() {
        require(msg.sender == admin, "GmxShifter: forbidden");
        _;
    }

    constructor(address _from, address _to, address _gmx) public {
        from = _from;
        to = _to;
        gmx = _gmx;
        admin = msg.sender;
    }

    function shift() external onlyAdmin nonReentrant {
        MintableBaseToken gmxToken = MintableBaseToken(gmx);
        uint256 balance = gmxToken.balanceOf(from);

        gmxToken.burn(from, balance);
        gmxToken.mint(to, balance);
    }
}
