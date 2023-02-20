/* eslint-disable node/no-unpublished-import */
/* eslint-disable node/no-missing-import */
import { constants } from "ethers";
import { concat } from "ethers/lib/utils";
import { ethers } from "hardhat";
import { ScrollChain, L1MessageQueue } from "../typechain";

describe("ScrollChain", async () => {
  let queue: L1MessageQueue;
  let chain: ScrollChain;

  beforeEach(async () => {
    const [deployer] = await ethers.getSigners();

    const L1MessageQueue = await ethers.getContractFactory("L1MessageQueue", deployer);
    queue = await L1MessageQueue.deploy();
    await queue.deployed();

    const RollupVerifier = await ethers.getContractFactory("RollupVerifier", deployer);
    const verifier = await RollupVerifier.deploy();
    await verifier.deployed();

    const ScrollChain = await ethers.getContractFactory("ScrollChain", {
      signer: deployer,
      libraries: { RollupVerifier: verifier.address },
    });
    chain = await ScrollChain.deploy(0, 25, "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6");
    await chain.deployed();

    await chain.initialize(queue.address);
    await chain.updateSequencer(deployer.address, true);
    await queue.initialize(constants.AddressZero, constants.AddressZero);
  });

  it("should succeed", async () => {
    await chain.importGenesisBatch({
      blocks: [
        {
          blockHash: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
          parentHash: constants.HashZero,
          blockNumber: 0,
          timestamp: 0,
          baseFee: 0,
          gasLimit: 0,
          numTransactions: 0,
          numL1Messages: 0,
        },
      ],
      prevStateRoot: constants.HashZero,
      newStateRoot: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
      withdrawTrieRoot: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
      batchIndex: 0,
      parentBatchHash: constants.HashZero,
      l2Transactions: [],
    });
    const parentBatchHash = await chain.lastFinalizedBatchHash();

    for (let numTx = 1; numTx <= 25; ++numTx) {
      for (let txLength = 100; txLength <= 1000; txLength += 100) {
        const txs: Array<Uint8Array> = [];
        for (let i = 0; i < numTx; i++) {
          const tx = new Uint8Array(4 + txLength);
          let offset = 3;
          for (let x = txLength; x > 0; x = Math.floor(x / 256)) {
            tx[offset] = x % 256;
            offset -= 1;
          }
          tx.fill(1, 4);
          txs.push(tx);
        }
        const batch = {
          blocks: [
            {
              blockHash: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
              parentHash: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
              blockNumber: 1,
              timestamp: numTx * 100000 + txLength,
              baseFee: 0,
              gasLimit: 0,
              numTransactions: 0,
              numL1Messages: 0,
            },
          ],
          prevStateRoot: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
          newStateRoot: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
          withdrawTrieRoot: "0xb5baa665b2664c3bfed7eb46e00ebc110ecf2ebd257854a9bf2b9dbc9b2c08f6",
          batchIndex: 1,
          parentBatchHash: parentBatchHash,
          l2Transactions: concat(txs),
        };
        const estimateGas = await chain.estimateGas.commitBatch(batch);
        const tx = await chain.commitBatch(batch, { gasLimit: estimateGas.mul(12).div(10) });
        const receipt = await tx.wait();
        console.log(
          "Commit batch with l2TransactionsBytes:",
          numTx * (txLength + 4),
          "gasLimit:",
          tx.gasLimit.toString(),
          "estimateGas:",
          estimateGas.toString(),
          "gasUsed:",
          receipt.gasUsed.toString()
        );
      }
    }
  });
});