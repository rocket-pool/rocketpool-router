import { JsonFragment } from "@ethersproject/abi";
import { BigNumber, ethers } from "ethers";

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
}

class RocketPoolRouter {
  public static MAINNET_ADDRESS = "0xf125870b3f34f3456e98f8d161d8628da4ec3ab9";

  private options: RocketPoolRouterOptions;

  constructor(private readonly provider: ethers.providers.Provider, options: Partial<RocketPoolRouterOptions> = {}) {
    this.options = <RocketPoolRouterOptions>Object.assign(
      {
        routerAddress: RocketPoolRouter.MAINNET_ADDRESS,
      },
      options
    );
  }

  executeSwap(swap: SwapRoute, signer: ethers.Signer): ethers.ContractTransaction {
    // Lazy initialise router contract
    const routerContract = new ethers.Contract(
      this.options.routerAddress,
      RocketSwapRouter.abi as JsonFragment[],
      signer
    );

    if (swap.direction === SwapDirection.ToRETH) {
      return routerContract.swapTo(swap.uniswapPortion, swap.balancerPortion, swap.minAmountOut, swap.amountOut, {
        value: swap.amountIn,
      });
    } else {
      return routerContract.swapFrom(
        swap.uniswapPortion,
        swap.balancerPortion,
        swap.minAmountOut,
        swap.amountOut,
        swap.amountIn
      );
    }
  }

  async optimiseSwap(direction: SwapDirection, amountIn: BigNumber, steps: number = 10): Promise<any> {
    const routerContract = new ethers.Contract(
      this.options.routerAddress,
      RocketSwapRouter.abi as JsonFragment[],
      this.provider
    );

    let result;

    if (direction === SwapDirection.ToRETH) {
      result = await routerContract.callStatic.optimiseSwapTo(amountIn, steps);
    } else {
      result = await routerContract.callStatic.optimiseSwapFrom(amountIn, steps);
    }

    return <SwapRoute>{
      direction: direction,
      uniswapPortion: result.portions[0].toNumber(),
      balancerPortion: result.portions[1].toNumber(),
      amountIn: amountIn,
      amountOut: result.amountOut,
      minAmountOut: result.amountOut,
    };
  }
}

export default RocketPoolRouter;
