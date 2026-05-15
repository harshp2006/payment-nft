// scripts/deploy.js
// Deploy PaymentNFT to Arc Testnet
// Run: npx hardhat run scripts/deploy.js --network arc

const { ethers } = require("hardhat");

const USDC_ADDRESS = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";

async function main() {
  console.log("─".repeat(55));
  console.log("  Deploying PaymentNFT to Arc Testnet");
  console.log("─".repeat(55));

  // Deployer info
  const [deployer] = await ethers.getSigners();
  console.log(`\nDeployer  : ${deployer.address}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance   : ${ethers.formatEther(balance)} USDC (gas token)\n`);

  // Deploy
  console.log("Deploying PaymentNFT...");
  const PaymentNFT = await ethers.getContractFactory("PaymentNFT");
  const contract = await PaymentNFT.deploy();

  // Wait for the deployment transaction to be mined
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();

  // ── Results ─────────────────────────────────────────────
  console.log("\n" + "─".repeat(55));
  console.log("  ✅  Deployment successful!");
  console.log("─".repeat(55));
  console.log(`  Contract address : ${deployedAddress}`);
  console.log(`  Transaction hash : ${deployTx.hash}`);
  console.log(`  USDC address     : ${USDC_ADDRESS}`);
  console.log("─".repeat(55));
  console.log("\n📋  REMINDER: Save the contract address above.");
  console.log("    You will need it for the frontend / tests.\n");
}

main().catch((err) => {
  console.error("\n❌  Deployment failed:");
  console.error(err);
  process.exitCode = 1;
});
