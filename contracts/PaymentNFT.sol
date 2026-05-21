// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title PaymentNFT V2
 * @notice Dual-tier loyalty NFT system for Arc Testnet.
 */
contract PaymentNFT is ERC721 {
    using Strings for uint256;
    using Strings for address;

    struct Merchant {
        bool registered;
        string name;
        string category;
        string description;
        string websiteUrl;
        string logoUrl;
        uint8 collectionId;
        uint256 totalPaymentsReceived;
        uint256 totalUsdcReceived;
    }

    struct BuyerStats {
        uint256 paymentCount;
        uint256 totalAmountSpent;
    }

    struct TokenInfo {
        address merchant;
        uint256 paymentCount;
        uint256 amountSpent;
        uint8 collectionId;
    }

    // USDC on Arc Testnet
    IERC20 public constant USDC = IERC20(0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359);
    uint256 public constant MIN_PAYMENT = 100000; // 0.1 USDC

    uint256 private _nextTokenId;
    mapping(address => Merchant) public merchants;
    // buyer => merchant => stats
    mapping(address => mapping(address => BuyerStats)) public buyerMerchantStats;
    // buyer => total spent across all merchants
    mapping(address => uint256) public buyerTotalSpent;
    // buyer => unique merchant count
    mapping(address => address[]) private _buyerMerchants;
    mapping(address => mapping(address => bool)) private _hasPaidMerchant;

    mapping(uint256 => TokenInfo) public tokenInfos;

    event MerchantRegistered(address indexed merchant, string name, uint8 collectionId);
    event CollectionChanged(address indexed merchant, uint8 newCollectionId);
    event PaymentMade(address indexed buyer, address indexed merchant, uint256 amount, uint256 tokenId);

    constructor() ERC721("PaymentNFT", "PNFT") {
        _nextTokenId = 1;
    }

    function registerMerchant(
        string calldata name,
        string calldata category,
        string calldata description,
        string calldata websiteUrl,
        string calldata logoUrl,
        uint8 collectionId
    ) external {
        require(!merchants[msg.sender].registered, "Already registered");
        require(collectionId <= 5, "Invalid collection ID");

        merchants[msg.sender] = Merchant({
            registered: true,
            name: name,
            category: category,
            description: description,
            websiteUrl: websiteUrl,
            logoUrl: logoUrl,
            collectionId: collectionId,
            totalPaymentsReceived: 0,
            totalUsdcReceived: 0
        });

        emit MerchantRegistered(msg.sender, name, collectionId);
    }

    function setCollection(uint8 collectionId) external {
        require(merchants[msg.sender].registered, "Not a merchant");
        require(collectionId <= 5, "Invalid collection ID");
        merchants[msg.sender].collectionId = collectionId;
        emit CollectionChanged(msg.sender, collectionId);
    }

    function payMerchant(address merchant, uint256 amount) external {
        require(merchants[merchant].registered, "Merchant not registered");
        require(amount >= MIN_PAYMENT, "Below minimum payment");

        // Transfer USDC
        require(USDC.transferFrom(msg.sender, merchant, amount), "USDC transfer failed");

        // Update Merchant Stats
        merchants[merchant].totalPaymentsReceived += 1;
        merchants[merchant].totalUsdcReceived += amount;

        // Update Buyer-Merchant Stats
        buyerMerchantStats[msg.sender][merchant].paymentCount += 1;
        buyerMerchantStats[msg.sender][merchant].totalAmountSpent += amount;

        // Update Buyer Global Stats
        buyerTotalSpent[msg.sender] += amount;
        if (!_hasPaidMerchant[msg.sender][merchant]) {
            _hasPaidMerchant[msg.sender][merchant] = true;
            _buyerMerchants[msg.sender].push(merchant);
        }

        // Mint NFT
        uint256 tokenId = _nextTokenId++;
        tokenInfos[tokenId] = TokenInfo({
            merchant: merchant,
            paymentCount: buyerMerchantStats[msg.sender][merchant].paymentCount,
            amountSpent: buyerMerchantStats[msg.sender][merchant].totalAmountSpent,
            collectionId: merchants[merchant].collectionId
        });

        _safeMint(msg.sender, tokenId);

        emit PaymentMade(msg.sender, merchant, amount, tokenId);
    }

    // View Functions
    function getLoyaltyTier(address buyer, address merchant) public view returns (uint8) {
        uint256 count = buyerMerchantStats[buyer][merchant].paymentCount;
        if (count >= 50) return 2; // Gold
        if (count >= 10) return 1; // Silver
        if (count >= 1) return 0; // Bronze
        return 0; // Default
    }

    function getWhaleTier(address buyer, address merchant) public view returns (uint8) {
        uint256 spent = buyerMerchantStats[buyer][merchant].totalAmountSpent;
        if (spent >= 100 * 10**6) return 2; // Diamond
        if (spent >= 25 * 10**6) return 1; // Pearl
        if (spent >= 1 * 10**6) return 0; // Copper
        return 0; // Default
    }

    function getPaymentCount(address buyer, address merchant) external view returns (uint256) {
        return buyerMerchantStats[buyer][merchant].paymentCount;
    }

    function getTotalSpent(address buyer, address merchant) external view returns (uint256) {
        return buyerMerchantStats[buyer][merchant].totalAmountSpent;
    }

    function getMerchant(address merchant) external view returns (Merchant memory) {
        return merchants[merchant];
    }

    function getBuyerStats(address buyer) external view returns (uint256 totalSpentAllMerchants, uint256 uniqueMerchantCount) {
        return (buyerTotalSpent[buyer], _buyerMerchants[buyer].length);
    }

    // Metadata
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        TokenInfo memory info = tokenInfos[tokenId];
        Merchant memory m = merchants[info.merchant];

        uint8 loyalty = _calcLoyalty(info.paymentCount);
        uint8 whale = _calcWhale(info.amountSpent);

        string memory svg = _buildSVG(info, loyalty, whale, m.name);
        
        string memory json = string(abi.encodePacked(
            '{"name":"', m.name, ' Loyalty #', tokenId.toString(), '",',
            '"description":"Exclusive loyalty NFT for ', m.name, ' customers.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":[',
                '{"trait_type":"Merchant Name","value":"', m.name, '"},',
                '{"trait_type":"Collection","value":"', _getCollName(info.collectionId), '"},',
                '{"trait_type":"Loyalty Tier","value":"', _getLoyaltyName(loyalty), '"},',
                '{"trait_type":"Whale Tier","value":"', _getWhaleName(whale), '"},',
                '{"trait_type":"Payment Count","value":', info.paymentCount.toString(), '},',
                '{"trait_type":"Total Spent (in USDC)","value":"', _formatUSDC(info.amountSpent), '"}'
            ']}'
        ));

        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    function _calcLoyalty(uint256 count) internal pure returns (uint8) {
        if (count >= 50) return 2;
        if (count >= 10) return 1;
        return 0;
    }

    function _calcWhale(uint256 spent) internal pure returns (uint8) {
        if (spent >= 100 * 10**6) return 2;
        if (spent >= 25 * 10**6) return 1;
        return 0;
    }

    function _getLoyaltyName(uint8 tier) internal pure returns (string memory) {
        if (tier == 2) return "Gold";
        if (tier == 1) return "Silver";
        return "Bronze";
    }

    function _getWhaleName(uint8 tier) internal pure returns (string memory) {
        if (tier == 2) return "Diamond";
        if (tier == 1) return "Pearl";
        return "Copper";
    }

    function _getCollName(uint8 id) internal pure returns (string memory) {
        string[6] memory names = ["Cosmic", "Samurai", "Nature", "Cyberpunk", "Royal", "Ocean"];
        return names[id];
    }

    function _formatUSDC(uint256 amount) internal pure returns (string memory) {
        uint256 integer = amount / 10**6;
        uint256 fraction = (amount % 10**6) / 10**4; // 2 decimals
        return string(abi.encodePacked(integer.toString(), ".", fraction < 10 ? "0" : "", fraction.toString()));
    }

    function _getColors(uint8 id) internal pure returns (string memory bg, string memory accent) {
        if (id == 0) return ("#0D0D2B", "#7B2FBE"); // Cosmic
        if (id == 1) return ("#1A0A0A", "#CC2200"); // Samurai
        if (id == 2) return ("#0A1F0A", "#2D6A2D"); // Nature
        if (id == 3) return ("#050510", "#00FFFF"); // Cyberpunk
        if (id == 4) return ("#1A0D2E", "#DAA520"); // Royal
        return ("#020D1A", "#0077B6"); // Ocean
    }

    function _buildSVG(TokenInfo memory info, uint8 loyalty, uint8 whale, string memory merchantName) internal pure returns (string memory) {
        (string memory bg, string memory accent) = _getColors(info.collectionId);
        
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="', bg, '"/>',
            '<defs>',
                '<linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">',
                    '<stop offset="0%" style="stop-color:', accent, ';stop-opacity:0.2" />',
                    '<stop offset="100%" style="stop-color:#000;stop-opacity:0.5" />',
                '</linearGradient>',
            '</defs>',
            '<rect width="400" height="400" fill="url(#grad)"/>',
            
            // Left Side: Loyalty
            '<g transform="translate(100, 200)">',
                _getCrownSVG(loyalty, accent),
                '<text y="80" fill="', accent, '" font-family="Arial" font-size="14" text-anchor="middle" font-weight="bold">LOYALTY</text>',
                '<text y="100" fill="#fff" font-family="Arial" font-size="18" text-anchor="middle">', _getLoyaltyName(loyalty), '</text>',
            '</g>',

            // Right Side: Whale
            '<g transform="translate(300, 200)">',
                _getGemSVG(whale, accent),
                '<text y="80" fill="', accent, '" font-family="Arial" font-size="14" text-anchor="middle" font-weight="bold">WHALE</text>',
                '<text y="100" fill="#fff" font-family="Arial" font-size="18" text-anchor="middle">', _getWhaleName(whale), '</text>',
            '</g>',

            // Middle Divider
            '<line x1="200" y1="80" x2="200" y2="320" stroke="', accent, '" stroke-width="1" stroke-dasharray="4"/>',

            // Merchant Name
            '<text x="200" y="50" fill="#fff" font-family="Arial" font-size="24" text-anchor="middle" font-weight="bold">', merchantName, '</text>',
            
            // Stats Footer
            '<rect x="50" y="340" width="300" height="40" rx="10" fill="#000" opacity="0.3"/>',
            '<text x="200" y="365" fill="#aaa" font-family="Arial" font-size="12" text-anchor="middle">',
                info.paymentCount.toString(), ' Payments | ', _formatUSDC(info.amountSpent), ' USDC Total',
            '</text>',
            '</svg>'
        ));
    }

    function _getCrownSVG(uint8 tier, string memory color) internal pure returns (string memory) {
        string memory opacity = tier == 2 ? "1.0" : (tier == 1 ? "0.6" : "0.3");
        return string(abi.encodePacked(
            '<path d="M-40,20 L-40,-20 L-20,0 L0,-30 L20,0 L40,-20 L40,20 Z" fill="', color, '" opacity="', opacity, '"/>',
            tier == 2 ? '<circle cy="-35" r="5" fill="#fff"/>' : ''
        ));
    }

    function _getGemSVG(uint8 tier, string memory color) internal pure returns (string memory) {
        string memory opacity = tier == 2 ? "1.0" : (tier == 1 ? "0.6" : "0.3");
        return string(abi.encodePacked(
            '<path d="M0,-40 L35,0 L0,40 L-35,0 Z" fill="', color, '" opacity="', opacity, '"/>',
            tier == 2 ? '<path d="M0,-20 L15,0 L0,20 L-15,0 Z" fill="#fff" opacity="0.5"/>' : ''
        ));
    }
}
