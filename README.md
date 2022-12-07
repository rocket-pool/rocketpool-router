# Rocket Pool Swap Router

This repository contains the Rocket Pool Swap Router contract and route optimiser which are
designed to split ETH/rETH swaps optimally between Uniswap and Balancer.

The Rocket Pool deposit pool is always used as a first source of liquidity. Whatever is left
over (which will often be the entire amount) is split between Uniswap and Balancer based on the
caller's inputs.

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