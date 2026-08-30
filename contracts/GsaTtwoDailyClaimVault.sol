// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

/// @title GSA TTWO Daily Claim Vault
/// @notice Owner loads a daily GSA-holder allocation, funds TTWO, then holders claim their own share.
contract GsaTtwoDailyClaimVault {
    error NotOwner();
    error ReentrantCall();
    error BadAddress();
    error BadArray();
    error BadRound();
    error RoundExists();
    error RoundMissing();
    error ClaimsAlreadyOpen();
    error ClaimsNotOpen();
    error NothingToClaim();
    error Overfunded();
    error NotFullyFunded();
    error RoundAlreadyFunded();
    error TokenReserved();
    error TokenCallFailed();

    struct Round {
        bytes32 snapshotHash;
        uint256 totalAllocated;
        uint256 funded;
        uint256 claimed;
        bool claimsOpen;
        bool exists;
        string label;
    }

    IERC20 public immutable ttwo;
    address public owner;
    uint256 public reservedTtwo;
    uint256 public latestRoundId;
    uint256 public latestOpenRoundId;

    mapping(uint256 => Round) private _rounds;
    mapping(uint256 => mapping(address => uint256)) public allocations;
    mapping(uint256 => mapping(address => uint256)) public claimed;

    uint256 private _locked;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event RoundCreated(uint256 indexed roundId, bytes32 snapshotHash, string label);
    event AllocationsSet(uint256 indexed roundId, uint256 count, uint256 totalAllocated);
    event RoundFunded(uint256 indexed roundId, uint256 amount, uint256 funded);
    event ClaimsOpened(uint256 indexed roundId);
    event ClaimsClosed(uint256 indexed roundId);
    event Claimed(uint256 indexed roundId, address indexed account, uint256 amount);
    event ClosedRoundRecovered(uint256 indexed roundId, address indexed to, uint256 amount);
    event TokenRecovered(address indexed token, address indexed to, uint256 amount);

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (_locked == 1) revert ReentrantCall();
        _locked = 1;
        _;
        _locked = 0;
    }

    constructor(address ttwoToken) {
        if (ttwoToken == address(0)) revert BadAddress();
        ttwo = IERC20(ttwoToken);
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert BadAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function createRound(uint256 roundId, bytes32 snapshotHash, string calldata label) external onlyOwner {
        if (roundId == 0) revert BadRound();
        if (_rounds[roundId].exists) revert RoundExists();

        _rounds[roundId].snapshotHash = snapshotHash;
        _rounds[roundId].exists = true;
        _rounds[roundId].label = label;
        if (roundId > latestRoundId) {
            latestRoundId = roundId;
        }

        emit RoundCreated(roundId, snapshotHash, label);
    }

    function setAllocations(
        uint256 roundId,
        address[] calldata accounts,
        uint256[] calldata amounts
    ) external onlyOwner {
        Round storage round = _round(roundId);
        if (round.claimsOpen) revert ClaimsAlreadyOpen();
        if (round.funded != 0) revert RoundAlreadyFunded();
        if (accounts.length != amounts.length || accounts.length == 0) revert BadArray();

        uint256 totalAllocated = round.totalAllocated;

        for (uint256 index = 0; index < accounts.length; index++) {
            address account = accounts[index];
            if (account == address(0)) revert BadAddress();

            uint256 oldAmount = allocations[roundId][account];
            uint256 newAmount = amounts[index];
            allocations[roundId][account] = newAmount;

            if (newAmount >= oldAmount) {
                totalAllocated += newAmount - oldAmount;
            } else {
                totalAllocated -= oldAmount - newAmount;
            }
        }

        if (round.funded > totalAllocated) revert Overfunded();
        round.totalAllocated = totalAllocated;

        emit AllocationsSet(roundId, accounts.length, totalAllocated);
    }

    function fundRound(uint256 roundId, uint256 amount, bool openAfterFunding) external onlyOwner nonReentrant {
        Round storage round = _round(roundId);
        if (amount == 0) revert BadRound();

        if (round.funded + amount > round.totalAllocated) revert Overfunded();

        uint256 beforeBalance = ttwo.balanceOf(address(this));
        _safeTransferFrom(address(ttwo), msg.sender, address(this), amount);
        uint256 received = ttwo.balanceOf(address(this)) - beforeBalance;
        if (received == 0) revert BadRound();

        uint256 newFunded = round.funded + received;
        if (newFunded > round.totalAllocated) revert Overfunded();

        round.funded = newFunded;
        reservedTtwo += received;

        emit RoundFunded(roundId, received, newFunded);

        if (openAfterFunding) {
            _openRound(roundId, round);
        }
    }

    function openRound(uint256 roundId) external onlyOwner {
        Round storage round = _round(roundId);
        _openRound(roundId, round);
    }

    function closeRound(uint256 roundId) external onlyOwner {
        Round storage round = _round(roundId);
        if (!round.claimsOpen) revert ClaimsNotOpen();
        round.claimsOpen = false;
        if (latestOpenRoundId == roundId) {
            latestOpenRoundId = 0;
        }
        emit ClaimsClosed(roundId);
    }

    function claim(uint256 roundId) external nonReentrant {
        Round storage round = _round(roundId);
        if (!round.claimsOpen) revert ClaimsNotOpen();

        uint256 allocation = allocations[roundId][msg.sender];
        uint256 alreadyClaimed = claimed[roundId][msg.sender];
        if (allocation <= alreadyClaimed) revert NothingToClaim();

        uint256 amount = allocation - alreadyClaimed;
        claimed[roundId][msg.sender] = allocation;
        round.claimed += amount;
        reservedTtwo -= amount;

        _safeTransfer(address(ttwo), msg.sender, amount);
        emit Claimed(roundId, msg.sender, amount);
    }

    function claimable(uint256 roundId, address account) external view returns (uint256) {
        if (!_rounds[roundId].exists || !_rounds[roundId].claimsOpen) return 0;

        uint256 allocation = allocations[roundId][account];
        uint256 alreadyClaimed = claimed[roundId][account];
        if (allocation <= alreadyClaimed) return 0;

        return allocation - alreadyClaimed;
    }

    function roundStatus(uint256 roundId) external view returns (
        bytes32 snapshotHash,
        uint256 totalAllocated,
        uint256 funded,
        uint256 claimedAmount,
        bool claimsOpen,
        bool exists
    ) {
        Round storage round = _rounds[roundId];
        return (
            round.snapshotHash,
            round.totalAllocated,
            round.funded,
            round.claimed,
            round.claimsOpen,
            round.exists
        );
    }

    function roundLabel(uint256 roundId) external view returns (string memory) {
        return _rounds[roundId].label;
    }

    function recoverToken(address token, address to, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0) || to == address(0)) revert BadAddress();
        if (token == address(ttwo)) {
            uint256 freeBalance = ttwo.balanceOf(address(this)) - reservedTtwo;
            if (amount > freeBalance) revert TokenReserved();
        }
        _safeTransfer(token, to, amount);
        emit TokenRecovered(token, to, amount);
    }

    function recoverClosedRound(uint256 roundId, address to) external onlyOwner nonReentrant {
        if (to == address(0)) revert BadAddress();

        Round storage round = _round(roundId);
        if (round.claimsOpen) revert ClaimsAlreadyOpen();

        uint256 unclaimed = round.funded - round.claimed;
        if (unclaimed == 0) revert NothingToClaim();

        round.funded = round.claimed;
        reservedTtwo -= unclaimed;

        _safeTransfer(address(ttwo), to, unclaimed);
        emit ClosedRoundRecovered(roundId, to, unclaimed);
    }

    function _openRound(uint256 roundId, Round storage round) private {
        if (round.totalAllocated == 0) revert BadRound();
        if (round.funded < round.totalAllocated) revert NotFullyFunded();
        if (!round.claimsOpen) {
            round.claimsOpen = true;
            latestOpenRoundId = roundId;
            emit ClaimsOpened(roundId);
        }
    }

    function _round(uint256 roundId) private view returns (Round storage round) {
        round = _rounds[roundId];
        if (!round.exists) revert RoundMissing();
    }

    function _safeTransfer(address token, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transfer.selector, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenCallFailed();
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        (bool ok, bytes memory data) = token.call(abi.encodeWithSelector(IERC20.transferFrom.selector, from, to, amount));
        if (!ok || (data.length != 0 && !abi.decode(data, (bool)))) revert TokenCallFailed();
    }
}
