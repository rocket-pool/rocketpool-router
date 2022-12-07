# Rocket Pool Swap Router

This repository contains the Rocket Pool Swap Router contract and route optimiser which are
designed to split ETH/rETH swaps optimally between Uniswap and Balancer.

If the rETH can be minted or burned at a better rate by the protocol than the market, it will route as much of the
swap through the protocol as possible. The remainder will be traded on the market at the specified split.

There is a JavaScript client component `RocketPoolRouter` which implements a basic price optimisation
strategy to calculate the best split between the Uniswap and Balancer liquidity sources at the present moment.

## Usage

The basic usage is:

```js
// Create an ethers provider and a signer
const provider = ...;
const signer = ...;

// Create a router instance
const router = new RocketPoolRouter(provider);

// Calculate optimal split between liquidity pools
const swap = await router.optimiseSwap(ethers.utils.parseEther('10'));

// Allow 1% slippage
swap.amountOut = swap.amountOut.mul(99).div(100);

// Execute the swap and wait for confirmation
const tx = await router.executeSwap(swap, signer);
await tx.wait();
```