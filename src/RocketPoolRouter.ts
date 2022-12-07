import UniswapRateProvider from "./rates/UniswapRateProvider";
import RateProvider from "./rates/RateProvider";
import { JsonFragment } from "@ethersproject/abi";
import { BalancerSdkConfig } from "@balancer-labs/sdk";
import { BigNumber, ethers } from "ethers";
import BalancerRateProvider from "./rates/BalancerRateProvider";

import * as RocketSwapRouter from "./abi/RocketSwapRouter.json";

export enum SwapDirection {
  ToRETH = 0,
  ToETH = 1,
}

interface SwapRoute {
  direction: SwapDirection;
  uniswapPortion: number;
  balancerPortion: number;
  amountIn: BigNumber;
  amountOut: BigNumber;
  minAmountOut: BigNumber;
}

interface RocketPoolRouterOptions {
  routerAddress: string;
  uniswapPoolAddress: string;
  uniswapQuoterAddress: string;
  balancerPoolId: string;
  balancerSdkConfig: BalancerSdkConfig;
}

class RocketPoolRouter {
  public static MAINNET_ADDRESS = "";

  private rateProviders: RateProvider[];
  private routerContract: ethers.Contract | null;
  private options: RocketPoolRouterOptions;

  constructor(private readonly provider: ethers.providers.Provider, options: Partial<RocketPoolRouterOptions> = {}) {
    this.options = <RocketPoolRouterOptions>Object.assign(
      {
        routerAddress: RocketPoolRouter.MAINNET_ADDRESS,
        uniswapPoolAddress: UniswapRateProvider.MAINNET_POOL_ADDRESS,
        uniswapQuoterAddress: UniswapRateProvider.MAINNET_QUOTER_ADDRESS,
        balancerPoolId: BalancerRateProvider.MAINNET_POOL_ID,
        balancerSdkConfig: <BalancerSdkConfig>{
          network: 1,
          rpcUrl: provider instanceof ethers.providers.JsonRpcProvider ? provider.connection.url : null,
        },
      },
      options
    );

    // Create the rate providers
    let uniswapRateProvider = new UniswapRateProvider(
      provider,
      this.options.uniswapPoolAddress,
      this.options.uniswapQuoterAddress
    );
    let balancerRateProvider = new BalancerRateProvider(provider, this.options.balancerSdkConfig);

    this.rateProviders = [];
    this.rateProviders.push(uniswapRateProvider);
    this.rateProviders.push(balancerRateProvider);

    this.routerContract = null;
  }

  executeSwap(swap: SwapRoute, signer: ethers.Signer): ethers.ContractTransaction {
    // Lazy initialise router contract
    if (!this.routerContract) {
      this.routerContract = new ethers.Contract(
        this.options.routerAddress,
        RocketSwapRouter.abi as JsonFragment[],
        signer
      );
    }

    if (swap.direction === SwapDirection.ToRETH) {
      return this.routerContract.swapTo(swap.uniswapPortion, swap.balancerPortion, swap.minAmountOut, swap.amountOut, {
        gasLimit: "2000000",
        value: swap.amountIn,
      });
    } else {
      return this.routerContract.swapFrom(
        swap.uniswapPortion,
        swap.balancerPortion,
        swap.minAmountOut,
        swap.amountOut,
        swap.amountIn
      );
    }
  }

  async optimiseSwap(direction: SwapDirection, amountIn: BigNumber, steps: number = 10): Promise<SwapRoute> {
    let providerCount = this.rateProviders.length;
    let amountPerStep = amountIn.div(steps);

    let rateMethod = direction === SwapDirection.ToRETH ? "getRethOut" : "getEthOut";

    let portions: number[] = new Array(providerCount).fill(0);
    let lastPrices = await Promise.all(this.rateProviders.map((provider) => provider[rateMethod](amountPerStep)));
    let priceDeltas = lastPrices.map((price) => BigNumber.from(price));

    let totalOut = BigNumber.from("0");

    // The `amountIn` is split into `steps` steps and we loop over calculating which liquidity pool has the
    // best price for the next `amountIn / steps` input
    for (let i = 1; ; i++) {
      let most = 0;

      for (let j = 1; j < priceDeltas.length; j++) {
        if (priceDeltas[j].gt(priceDeltas[most])) {
          most = j;
        }
      }

      totalOut = totalOut.add(priceDeltas[most]);
      portions[most]++;

      if (i === steps) {
        break;
      }

      let nextPrice = await this.rateProviders[most][rateMethod](amountPerStep.mul(portions[most] + 1));
      priceDeltas[most] = nextPrice.sub(lastPrices[most]);
      lastPrices[most] = nextPrice;
    }

    return <SwapRoute>{
      direction: direction,
      uniswapPortion: portions[0],
      balancerPortion: portions[1],
      amountIn: amountIn,
      amountOut: totalOut,
      minAmountOut: totalOut,
    };
  }
}

export default RocketPoolRouter;
