import { BigNumber, ethers } from "ethers";
import RateProvider from "./RateProvider";
import { BalancerSDK, BalancerSdkConfig, SubgraphPoolBase } from "@balancer-labs/sdk";
import { MetaStablePool, OldBigNumber } from "@balancer-labs/sor";

class BalancerRateProvider extends RateProvider {
  public static MAINNET_POOL_ID = "0x1e19cf2d73a72ef1332c882f20534b6519be0276000200000000000000000112";

  private msPool: MetaStablePool | null;
  private poolPairData: any;

  constructor(
    private readonly provider: ethers.providers.Provider,
    private balanceSdkConfig: BalancerSdkConfig,
    private readonly poolId: string = BalancerRateProvider.MAINNET_POOL_ID
  ) {
    super();

    this.msPool = null;
  }

  async getAmountOut(amountIn: BigNumber): Promise<BigNumber> {
    // Lazy initialise the pool instance
    if (!this.msPool) {
      const balancer = new BalancerSDK(this.balanceSdkConfig);
      const pool = await balancer.pools.find(this.poolId);
      this.msPool = MetaStablePool.fromPool(pool as SubgraphPoolBase);

      this.poolPairData = this.msPool.parsePoolPairData(
        "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
        "0xae78736Cd615f374D3085123A210448E74Fc6393"
      );
    }

    // Use BalancerSDK to calculate the amount of tokens out from the specified amount in
    // Note: BalancerSDK uses an old version of BigNumber so we have to do some weird conversions
    let ONE = ethers.utils.parseEther("1").toString();

    let amountInBN = new OldBigNumber(amountIn.toString());
    let amountInEthBN = amountInBN.div(new OldBigNumber(ONE));
    let rateBN = this.msPool._exactTokenInForTokenOut(this.poolPairData, amountInEthBN);

    let rateEthBN = rateBN.times(new OldBigNumber(ONE));
    return BigNumber.from(rateEthBN.toString());
  }
}

export default BalancerRateProvider;
