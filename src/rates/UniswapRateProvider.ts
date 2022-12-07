import RateProvider from "./RateProvider";
import { ethers, BigNumber } from "ethers";
import { JsonFragment } from "@ethersproject/abi";

import * as UniswapQuoter from "../abi/UniswapQuoter.json";
import * as UniswapV3Pool from "../abi/IUniswapV3Pool.json";

class UniswapRateProvider extends RateProvider {
  public static MAINNET_QUOTER_ADDRESS = "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6";
  public static MAINNET_POOL_ADDRESS = "0xa4e0faa58465a2d369aa21b3e42d43374c6f9613";

  private readonly poolContract: ethers.Contract;
  private readonly quoterContract: ethers.Contract;

  private immutables: { token0: string; fee: BigNumber; token1: string } | null;

  constructor(
    private readonly provider: ethers.providers.Provider,
    poolAddress: string = UniswapRateProvider.MAINNET_POOL_ADDRESS,
    quoterAddress: string = UniswapRateProvider.MAINNET_QUOTER_ADDRESS
  ) {
    super();

    this.poolContract = new ethers.Contract(poolAddress, UniswapV3Pool.abi as JsonFragment[], provider);
    this.quoterContract = new ethers.Contract(quoterAddress, UniswapQuoter.abi as JsonFragment[], provider);
    this.immutables = null;
  }

  public async getAmountOut(amountIn: BigNumber): Promise<BigNumber> {
    // Lazy load pool immutables
    if (!this.immutables) {
      this.immutables = await this.getPoolImmutables();
    }

    // Call the quoter contract to determine the amount out of a swap, given an amount in
    const immutables = this.immutables;
    return await this.quoterContract.callStatic.quoteExactInputSingle(
      immutables.token1,
      immutables.token0,
      immutables.fee,
      amountIn,
      0
    );
  }

  private async getPoolImmutables(): Promise<{ token0: string; fee: BigNumber; token1: string }> {
    const [token0, token1, fee] = await Promise.all([
      this.poolContract.token0(),
      this.poolContract.token1(),
      this.poolContract.fee(),
    ]);

    return {
      token0,
      token1,
      fee,
    };
  }
}

export default UniswapRateProvider;
