// scripts/deploy.js
const { ethers } = require("hardhat");

async function main() {
  console.log("🚀 Starting Deployment of PaymentNFT V2...");

  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance: ${ethers.formatUnits(balance, 6)} USDC (Gas token)`);

  const PaymentNFT = await ethers.getContractFactory("PaymentNFT");
  const contract = await PaymentNFT.deploy();

  console.log("Waiting for deployment...");
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("\n" + "=".repeat(40));
  console.log(`✅ PaymentNFT V2 Deployed!`);
  console.log(`Address: ${address}`);
  console.log(`Explorer: https://testnet.arcscan.app/address/${address}`);
  console.log(`\nUpdate CONTRACT_ADDRESS in frontend/src/App.jsx with: ${address}`);
  console.log("=".repeat(40) + "\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
