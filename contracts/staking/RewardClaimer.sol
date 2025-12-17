// SPDX-License-Identifier: MIT

pragma solidity 0.6.12;

import "../libraries/math/SafeMath.sol";
import "../libraries/token/IERC20.sol";

import "./interfaces/IRewardTracker.sol";

import "../access/Governable.sol";

contract RewardClaimer is Governable {
    using SafeMath for uint256;

    address public sender;
    address public feeGlpTracker;

    constructor(
        address _sender,
        address _feeGlpTracker
    ) public {
        sender = _sender;
        feeGlpTracker = _feeGlpTracker;
    }

    function claim(address _recipient) external onlyGov {
        IRewardTracker(feeGlpTracker).claimForAccount(sender, _recipient);
    }
}
