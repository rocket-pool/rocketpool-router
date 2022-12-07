import { BigNumber } from "ethers";

abstract class RateProvider {
  /**
   * Returns the amount of rETH received in return for the given amount of ETH.
   * @param amountIn Amount of ETH in wei
   */
  abstract getAmountOut(amountIn: BigNumber): Promise<BigNumber>;
}

export default RateProvider;
