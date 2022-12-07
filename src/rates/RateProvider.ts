import { BigNumber } from "ethers";

abstract class RateProvider {
  /**
   * Returns the amount of rETH received in return for the given amount of ETH.
   * @param ethIn Amount of ETH in wei
   */
  abstract getRethOut(ethIn: BigNumber): Promise<BigNumber>;

  /**
   * Returns the amount of ETH received in return for the given amount of rETH.
   * @param rethIn Amount of rETH in wei
   */
  abstract getEthOut(rethIn: BigNumber): Promise<BigNumber>;
}

export default RateProvider;
