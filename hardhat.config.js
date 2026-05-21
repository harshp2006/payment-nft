require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      viaIR: true,
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    arc: {
      url: "https://5042002.rpc.thirdweb.com",
      chainId: 5042002,
            accounts: [process.env.PRIVATE_KEY]
    }
  }
};