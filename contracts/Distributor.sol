pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/BitMaps.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./MerkleProof.sol";

contract Distributor is Ownable, ReentrancyGuard {
    // token

    uint256 public maxSupply;
    IToken public token;

    function setTokenOptions(IToken _token, uint256 _maxSupply) external onlyOwner {
        token = _token;
        maxSupply = _maxSupply;
    }

    // buy

    using SafeMath for uint256;
    uint256 public price;
    uint256 public artistPercent;
    uint256 public maxBuyable;
    uint256 public boughtCount;
    address public burnWallet;
    address public artistWallet;
    event Buy(address indexed buyer, uint256 amount);

    function buy(uint256 amount) external payable nonReentrant {
        require(price != 0, 'buy: closed');
        require(burnWallet != address(0), 'buy: closed');
        uint256 paymentAmount = price.mul(amount);
        require(paymentAmount <= msg.value, 'buy: paid too little');
        // recheck here to save gas on revert
        require(boughtCount.add(amount) <= maxBuyable, 'buy: max bought reached');

        // send artist payment share
        uint256 artistAmount = 0;
        if (artistWallet != address(0) && artistPercent != 0) {
            artistAmount = price.mul(amount).mul(artistPercent).div(100);
            (bool success, ) = artistWallet.call{value: artistAmount}('');
            require(success, 'buy: payment failed');
        }
        // send burn wallet share
        (bool success2, ) = burnWallet.call{value: paymentAmount.sub(artistAmount)}('');
        require(success2, 'buy: payment failed');

        int256 i = int256(amount);
        while (i-- > 0) {
            _buyMint(msg.sender);
        }
        emit Buy(msg.sender, amount);
    }

    // owner can buy for free in case there's a mistake with airdrop
    function ownerBuy(address _address, uint256 _amount) external onlyOwner {
        int256 i = int256(_amount);
        while (i-- > 0) {
            _buyMint(_address);
        }
        emit Buy(_address, _amount);
    }

    function _buyMint(address to) private {
        uint256 tokenId = token.totalSupply();
        require(tokenId <= maxSupply, '_buyMint: max supply reached');
        boughtCount++;
        require(boughtCount <= maxBuyable, '_buyMint: max bought reached');
        token.safeMint(to, tokenId);
    }

    function setBuyOptions(uint256 _price, uint256 _maxBuyable, address _burnWallet, address _artistWallet, uint256 _artistPercent) external onlyOwner {
        price = _price;
        maxBuyable = _maxBuyable;
        burnWallet = _burnWallet;
        artistWallet = _artistWallet;
        artistPercent = _artistPercent;
    }

    // airdrop

    using BitMaps for BitMaps.BitMap;
    BitMaps.BitMap internal claimedAirdrop;
    bytes32 public airdropMerkleRoot;
    event ClaimAirdrop(address indexed claimant, uint256 amount);
    event AirdropMerkleRootChanged(bytes32 merkleRoot);

    function claimAirdrop(uint256 amount, bytes32[] calldata merkleProof) external nonReentrant {
        bytes32 leaf = keccak256(abi.encodePacked(msg.sender, amount));
        (bool valid, uint256 index) = MerkleProof.verify(merkleProof, airdropMerkleRoot, leaf);
        require(valid, "claimAirdrop: merkle proof invalid");
        require(!claimedAirdrop.get(index), "claimAirdrop: airdrop already claimed");
        claimedAirdrop.set(index);

        int256 i = int256(amount);
        while (i-- > 0) {
            _airdropMint(msg.sender);
        }
        emit ClaimAirdrop(msg.sender, amount);
    }

    function _airdropMint(address to) private {
        uint256 tokenId = token.totalSupply();
        require(tokenId <= maxSupply, '_airdropMint: max supply reached');
        token.safeMint(to, tokenId);
    }

    function airdropIsClaimed(address recipient, uint256 amount, bytes32[] calldata merkleProof) external view returns (bool) {
        bytes32 leaf = keccak256(abi.encodePacked(recipient, amount));
        (, uint256 index) = MerkleProof.verify(merkleProof, airdropMerkleRoot, leaf);
        if (claimedAirdrop.get(index)) {
            return true;
        }
        else {
            return false;
        }
    }

    function setAirdropMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        airdropMerkleRoot = _merkleRoot;
        emit AirdropMerkleRootChanged(_merkleRoot);
    }
}

interface IToken {
    function totalSupply() external view returns (uint256);
    function safeMint(address to, uint256 tokenId) external;
}
