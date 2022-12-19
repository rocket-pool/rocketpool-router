import RocketPoolRouter, { SwapDirection } from "../src/RocketPoolRouter";
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
const MAINNET_UNISWAP_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
const MAINNET_UNISWAP_QUOTER = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
const MAINNET_BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";

async function getRethBalance(address: string) {
  const contract = new ethers.Contract(
    MAINNET_RETH,
    ["function balanceOf(address) external view returns (uint256)"],
    provider
  );
  return await contract.balanceOf(address);
}

async function approveReth(spender: string, amount: ethers.BigNumber) {
  const contract = new ethers.Contract(
    MAINNET_RETH,
    ["function approve(address spender, uint256 amount) external returns (bool)"],
    wallet
  );
  return await contract.approve(spender, amount);
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
    "500",
    MAINNET_UNISWAP_QUOTER,
    MAINNET_BALANCER_VAULT,
    BalancerRateProvider.MAINNET_POOL_ID
  );

  // Create a router instance
  const router = new RocketPoolRouter(provider, {
    routerAddress: routerContract.address,
  });

  // Swap to rETH
  {
    // Calculate the optimal swap of 50 ETH
    const swapTo = await router.optimiseSwap(SwapDirection.ToRETH, ethers.utils.parseEther("50"), 20);

    // Output the swap params
    console.log(swapTo);

    // Allow 1% slippage
    swapTo.minAmountOut = swapTo.amountOut.mul(99).div(100);

    // Execute the swap and output the change in balances
    const balanceBefore = await getRethBalance(wallet.address);
    const tx = await router.executeSwap(swapTo, wallet);
    await tx.wait();
    const balanceAfter = await getRethBalance(wallet.address);

    console.log("Before: ", ethers.utils.formatEther(balanceBefore));
    console.log("After: ", ethers.utils.formatEther(balanceAfter));
    console.log("Diff: ", ethers.utils.formatEther(balanceAfter.sub(balanceBefore)));
    console.log("Min Expected: ", ethers.utils.formatEther(swapTo.amountOut));
  }

  // Swap back to ETH
  {
    // Calculate the optimal swap of 50 rETH back to ETH
    const swapFrom = await router.optimiseSwap(SwapDirection.ToETH, ethers.utils.parseEther("20"), 20);

    // Output the swap params
    console.log(swapFrom);

    // Allow 1 % slippage
    swapFrom.minAmountOut = swapFrom.amountOut.mul(99).div(100);

    // Approve rETH
    await approveReth(routerContract.address, swapFrom.amountIn);

    // Execute the swap and output the change in balances
    const balanceBefore = ethers.BigNumber.from(await provider.getBalance(wallet.address));
    const tx = await router.executeSwap(swapFrom, wallet);
    await tx.wait();
    const balanceAfter = ethers.BigNumber.from(await provider.getBalance(wallet.address));

    console.log("Before: ", ethers.utils.formatEther(balanceBefore));
    console.log("After: ", ethers.utils.formatEther(balanceAfter));
    console.log("Diff: ", ethers.utils.formatEther(balanceAfter.sub(balanceBefore)));
    console.log("Min Expected: ", ethers.utils.formatEther(swapFrom.amountOut));
  }
}

go();
