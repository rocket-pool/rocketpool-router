import RocketPoolRouter from "../src/RocketPoolRouter";
import * as RocketSwapRouter from "../src/abi/RocketSwapRouter.json";

import { ethers } from "ethers";
import { JsonFragment } from "@ethersproject/abi";
import BalancerRateProvider from "../../rocketpool-router/src/rates/BalancerRateProvider";

const provider = new ethers.providers.JsonRpcProvider("http://localhost:8545");
const wallet = ethers.Wallet.fromMnemonic("test test test test test test test test test test test junk").connect(
  provider
);

const MAINNET_ROCKET_STORAGE = "0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46";
const MAINNET_WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const MAINNET_RETH = "0xae78736cd615f374d3085123a210448e74fc6393";
const MAINNET_UNISWAP_ROUTER = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const MAINNET_BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";

async function getRethBalance(address: string) {
  const contract = new ethers.Contract(
    MAINNET_RETH,
    ["function balanceOf(address) external view returns (uint256)"],
    provider
  );
  return await contract.balanceOf(address);
}

async function go() {
  // Deploy an instance of the router to our fork
  const contract = new ethers.ContractFactory(
    RocketSwapRouter.abi as JsonFragment[],
    RocketSwapRouter.bytecode,
    wallet
  );
  const routerContract = await contract.deploy(
    MAINNET_ROCKET_STORAGE,
    MAINNET_WETH,
    MAINNET_UNISWAP_ROUTER,
    MAINNET_BALANCER_VAULT,
    BalancerRateProvider.MAINNET_POOL_ID
  );

  // Create a router instance
  const router = new RocketPoolRouter(provider, {
    routerAddress: routerContract.address,
  });

  // Calculate the optimal swap of 50 ETH
  const swap = await router.optimiseSwap(ethers.utils.parseEther("50"));

  // Output the swap params
  console.log(swap);

  // Allow 1% slippage
  swap.amountOut = swap.amountOut.mul(99).div(100);

  // Execute the swap and output the change in balances
  const balanceBefore = await getRethBalance(wallet.address);
  const tx = await router.executeSwap(swap, wallet);
  await tx.wait();
  const balanceAfter = await getRethBalance(wallet.address);

  console.log("Before: ", ethers.utils.formatEther(balanceBefore));
  console.log("After: ", ethers.utils.formatEther(balanceAfter));
  console.log("Diff: ", ethers.utils.formatEther(balanceAfter.sub(balanceBefore)));
  console.log("Min Expected: ", ethers.utils.formatEther(swap.amountOut));
}

go();
