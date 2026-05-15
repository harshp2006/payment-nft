// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/**
 * @title  PaymentNFT
 * @notice ERC-721 loyalty NFT minted on every 1-USDC payment to a registered merchant.
 *         Deployed on Arc Testnet (EVM-compatible, USDC as gas token).
 *
 * Tier thresholds (per buyer-merchant pair):
 *   Bronze  1 – 9  payments  (#CD7F32)
 *   Silver 10 – 49 payments  (#C0C0C0)
 *   Gold   50+    payments   (#FFD700)
 *
 * USDC on Arc Testnet: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
 */
contract PaymentNFT is ERC721 {
    using Strings for uint256;
    using Strings for address;

    // ─────────────────────────────────────────────────────────────────────────
    //  Types
    // ─────────────────────────────────────────────────────────────────────────

    enum Tier { Bronze, Silver, Gold }

    struct MerchantInfo {
        bool   registered;
        string name;
    }

    struct PaymentRecord {
        address buyer;
        address merchant;
        uint256 paymentCount; // payment count snapshot at mint time
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Constants
    // ─────────────────────────────────────────────────────────────────────────

    /// @notice 1 USDC expressed in 6-decimal units
    uint256 public constant PAYMENT_AMOUNT = 1_000_000;

    /// @notice USDC ERC-20 contract on Arc Testnet
    IERC20 public immutable usdc;

    // ─────────────────────────────────────────────────────────────────────────
    //  State
    // ─────────────────────────────────────────────────────────────────────────

    uint256 private _nextTokenId;

    /// @notice merchant address → registration info
    mapping(address => MerchantInfo) public merchants;

    /// @notice buyer → merchant → lifetime payment count
    mapping(address => mapping(address => uint256)) private _paymentCount;

    /// @notice tokenId → payment record snapshot
    mapping(uint256 => PaymentRecord) private _records;

    // ─────────────────────────────────────────────────────────────────────────
    //  Events
    // ─────────────────────────────────────────────────────────────────────────

    event MerchantRegistered(address indexed merchant, string name);
    event PaymentMade(
        address indexed buyer,
        address indexed merchant,
        uint256 indexed tokenId,
        uint256 paymentCount,
        Tier    tier
    );

    // ─────────────────────────────────────────────────────────────────────────
    //  Constructor
    // ─────────────────────────────────────────────────────────────────────────

    constructor() ERC721("PaymentNFT", "PNFT") {
        usdc = IERC20(0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359);
        _nextTokenId = 1;
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Merchant registration
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Register the caller as a merchant.
     * @param  name  Human-readable merchant display name (non-empty).
     */
    function registerMerchant(string calldata name) external {
        require(bytes(name).length > 0,            "PaymentNFT: empty name");
        require(!merchants[msg.sender].registered, "PaymentNFT: already registered");

        merchants[msg.sender] = MerchantInfo({ registered: true, name: name });
        emit MerchantRegistered(msg.sender, name);
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Payment & mint
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Pay a registered merchant 1 USDC and receive a loyalty NFT.
     *         The caller must approve this contract for at least 1 USDC before
     *         calling (usdc.approve(address(this), 1_000_000)).
     * @param  merchant  Address of the registered merchant to pay.
     */
    function payMerchant(address merchant) external {
        require(merchants[merchant].registered, "PaymentNFT: merchant not registered");
        require(merchant != msg.sender,         "PaymentNFT: cannot pay yourself");

        // 1. Transfer 1 USDC from buyer → merchant
        require(
            usdc.transferFrom(msg.sender, merchant, PAYMENT_AMOUNT),
            "PaymentNFT: USDC transfer failed"
        );

        // 2. Increment payment counter
        _paymentCount[msg.sender][merchant] += 1;
        uint256 count = _paymentCount[msg.sender][merchant];

        // 3. Mint NFT to buyer
        uint256 tokenId = _nextTokenId;
        unchecked { _nextTokenId++; }

        _records[tokenId] = PaymentRecord({
            buyer:        msg.sender,
            merchant:     merchant,
            paymentCount: count
        });

        _safeMint(msg.sender, tokenId);

        emit PaymentMade(msg.sender, merchant, tokenId, count, _tierOf(count));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  View helpers
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * @notice Returns the current loyalty tier for a buyer-merchant pair.
     */
    function getTier(address buyer, address merchant) external view returns (Tier) {
        return _tierOf(_paymentCount[buyer][merchant]);
    }

    /**
     * @notice Returns the total number of payments from buyer to merchant.
     */
    function getPaymentCount(address buyer, address merchant) external view returns (uint256) {
        return _paymentCount[buyer][merchant];
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  ERC-721 metadata — fully onchain, base64-encoded JSON + SVG
    // ─────────────────────────────────────────────────────────────────────────

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        PaymentRecord memory rec  = _records[tokenId];
        Tier           tier       = _tierOf(rec.paymentCount);
        string memory  tierName   = _tierName(tier);
        string memory  tierColor  = _tierColor(tier);
        string memory  merchantNm = merchants[rec.merchant].name;

        string memory svg        = _buildSVG(tierName, tierColor, merchantNm, rec.paymentCount);
        string memory imageURI   = string(abi.encodePacked(
            "data:image/svg+xml;base64,", Base64.encode(bytes(svg))
        ));

        string memory json = string(abi.encodePacked(
            '{"name":"PaymentNFT #', tokenId.toString(), '",',
            '"description":"Loyalty NFT earned by paying ', merchantNm, ' on Arc Testnet.",',
            '"attributes":[',
                '{"trait_type":"Tier","value":"',          tierName,                    '"},',
                '{"trait_type":"Payment Count","value":', rec.paymentCount.toString(),  '},',
                '{"trait_type":"Merchant Name","value":"', merchantNm,                  '"},',
                '{"trait_type":"Merchant","value":"',      Strings.toHexString(uint160(rec.merchant), 20), '"},',
                '{"trait_type":"Buyer","value":"',         Strings.toHexString(uint160(rec.buyer),    20), '"}',
            '],',
            '"image":"', imageURI, '"}'
        ));

        return string(abi.encodePacked(
            "data:application/json;base64,",
            Base64.encode(bytes(json))
        ));
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal – tier logic
    // ─────────────────────────────────────────────────────────────────────────

    function _tierOf(uint256 count) internal pure returns (Tier) {
        if (count >= 50) return Tier.Gold;
        if (count >= 10) return Tier.Silver;
        return Tier.Bronze;
    }

    function _tierName(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.Gold)   return "Gold";
        if (tier == Tier.Silver) return "Silver";
        return "Bronze";
    }

    function _tierColor(Tier tier) internal pure returns (string memory) {
        if (tier == Tier.Gold)   return "#FFD700";
        if (tier == Tier.Silver) return "#C0C0C0";
        return "#CD7F32";
    }

    // ─────────────────────────────────────────────────────────────────────────
    //  Internal – SVG builder
    // ─────────────────────────────────────────────────────────────────────────

    function _buildSVG(
        string memory tierName,
        string memory tierColor,
        string memory merchantName,
        uint256       paymentCount
    ) internal pure returns (string memory) {
        string memory pluralSuffix = paymentCount == 1 ? "" : "s";

        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300">',

            // ── background ──────────────────────────────────────────────────
            '<defs>',
              '<radialGradient id="bg" cx="50%" cy="50%" r="70%">',
                '<stop offset="0%" stop-color="#1a1a2e"/>',
                '<stop offset="100%" stop-color="#0f0f1a"/>',
              '</radialGradient>',
              '<radialGradient id="glow" cx="50%" cy="50%" r="50%">',
                '<stop offset="0%" stop-color="', tierColor, '" stop-opacity="0.35"/>',
                '<stop offset="100%" stop-color="', tierColor, '" stop-opacity="0"/>',
              '</radialGradient>',
            '</defs>',
            '<rect width="300" height="300" rx="18" ry="18" fill="url(#bg)"/>',

            // ── ambient glow ─────────────────────────────────────────────────
            '<ellipse cx="150" cy="115" rx="90" ry="90" fill="url(#glow)"/>',

            // ── outer ring ───────────────────────────────────────────────────
            '<circle cx="150" cy="115" r="72" fill="none" stroke="', tierColor,
                '" stroke-width="2" opacity="0.5"/>',

            // ── medal body ───────────────────────────────────────────────────
            '<circle cx="150" cy="115" r="58" fill="', tierColor, '" opacity="0.12"/>',
            '<circle cx="150" cy="115" r="50" fill="', tierColor, '" opacity="0.25"/>',
            '<circle cx="150" cy="115" r="44" fill="', tierColor, '"/>',

            // ── tier initial ─────────────────────────────────────────────────
            '<text x="150" y="128" font-family="Georgia,serif" font-size="40" font-weight="bold" ',
                'fill="#1a1a2e" text-anchor="middle">',
                _tierInitial(tierName),
            '</text>',

            // ── tier label ───────────────────────────────────────────────────
            '<text x="150" y="198" font-family="Arial,sans-serif" font-size="20" font-weight="bold" ',
                'fill="', tierColor, '" text-anchor="middle">',
                tierName, ' Member',
            '</text>',

            // ── merchant name ────────────────────────────────────────────────
            '<text x="150" y="220" font-family="Arial,sans-serif" font-size="12" ',
                'fill="#888899" text-anchor="middle">',
                merchantName,
            '</text>',

            // ── payment count ────────────────────────────────────────────────
            '<text x="150" y="244" font-family="Arial,sans-serif" font-size="13" ',
                'fill="#aaaacc" text-anchor="middle">',
                paymentCount.toString(), ' payment', pluralSuffix,
            '</text>',

            // ── divider line ─────────────────────────────────────────────────
            '<line x1="60" y1="255" x2="240" y2="255" stroke="', tierColor,
                '" stroke-width="0.5" opacity="0.3"/>',

            // ── footer ───────────────────────────────────────────────────────
            '<text x="150" y="274" font-family="Arial,sans-serif" font-size="10" ',
                'fill="#44445a" text-anchor="middle">',
                'PaymentNFT \xc2\xb7 Arc Testnet',
            '</text>',

            '</svg>'
        ));
    }

    /// @dev Returns the first character of a tier name as a string.
    function _tierInitial(string memory tierName) internal pure returns (string memory) {
        bytes memory b = bytes(tierName);
        bytes memory out = new bytes(1);
        out[0] = b[0];
        return string(out);
    }
}
