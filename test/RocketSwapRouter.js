const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

String.prototype.__defineGetter__("ether", function () {
  return ethers.utils.parseEther(this.toString());
});

const MOCK_POOL_ID = "0x3ac225168df54212a25c1c01fd35bebfea408fdac2e31ddd6f80a4bbf9a5f1cb";

describe("RocketSwapRouter", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deploy() {
    const [owner, other] = await ethers.getSigners();

    const MockRETH = await ethers.getContractFactory("MockRETH");
    const mockRETH = await MockRETH.deploy();

    const MockWETH = await ethers.getContractFactory("MockWETH");
    const mockWETH = await MockWETH.deploy();

    const MockDepositPool = await ethers.getContractFactory("MockDepositPool");
    const mockDepositPool = await MockDepositPool.deploy(mockRETH.address);

    const MockBalancerVault = await ethers.getContractFactory("MockBalancerVault");
    const mockBalancerVault = await MockBalancerVault.deploy(mockRETH.address);

    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockUniswapRouter = await MockUniswapRouter.deploy(mockRETH.address);

    const MockDepositSettings = await ethers.getContractFactory("MockDepositSettings");
    const mockDepositSettings = await MockDepositSettings.deploy();

    const MockRocketStorage = await ethers.getContractFactory("MockRocketStorage");
    const mockRocketStorage = await MockRocketStorage.deploy();

    await mockRocketStorage.setAddress("rocketTokenRETH", mockRETH.address);
    await mockRocketStorage.setAddress("rocketDepositPool", mockDepositPool.address);
    await mockRocketStorage.setAddress("rocketDAOProtocolSettingsDeposit", mockDepositSettings.address);

    const RocketSwapRouter = await ethers.getContractFactory("RocketSwapRouter");
    const rocketSwapRouter = await RocketSwapRouter.deploy(
      mockRocketStorage.address,
      mockWETH.address,
      mockUniswapRouter.address,
      "500",
      mockBalancerVault.address,
      MOCK_POOL_ID
    );

    return {
      accounts: {
        owner,
        other,
      },
      mocks: {
        mockRocketStorage,
        mockDepositSettings,
        mockDepositPool,
        mockBalancerVault,
        mockUniswapRouter,
        mockRETH,
        mockWETH,
      },
      router: rocketSwapRouter,
    };
  }

  describe("Swap", function () {
    it("Should use the deposit pool for entire swap if there is space", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Do a swap
      const tx = router.swap("50".ether, "50".ether, "100".ether, { value: "100".ether });

      // Check results
      await expect(tx)
        .to.emit(mocks.mockDepositPool, "Deposit")
        .withArgs("100".ether)
        .to.changeTokenBalance(mocks.mockRETH, accounts.owner, "100".ether);
    });

    it("Should revert if minimum output is not met", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Set rate to 0.9 so we only get 90 rETH resulting in a revert
      await mocks.mockDepositPool.setRate("0.9".ether);

      // Do a swap
      const tx = router.swap("50".ether, "50".ether, "100".ether, { value: "100".ether });

      // Check results
      await expect(tx).to.be.revertedWithCustomError(router, "LessThanMinimum");
    });

    it("Should use uniswap correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swap("100".ether, "0".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event
      let foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockUniswapRouter.address) {
          const swapEvent = mocks.mockUniswapRouter.interface.parseLog(event);

          expect(swapEvent.args.evt.tokenIn).to.equal(mocks.mockWETH.address);
          expect(swapEvent.args.evt.tokenOut).to.equal(mocks.mockRETH.address);
          expect(swapEvent.args.evt.recipient).to.equal(accounts.owner.address);
          expect(swapEvent.args.evt.amountIn).to.equal("100".ether);
          expect(swapEvent.args.evt.amountOutMinimum).to.equal("0");
          expect(swapEvent.args.evt.sqrtPriceLimitX96).to.equal("0");

          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;
    });

    it("Should use balancer correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swap("0".ether, "100".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event
      let foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockBalancerVault.address) {
          const swapEvent = mocks.mockBalancerVault.interface.parseLog(event);

          expect(swapEvent.args.swap.poolId).to.equal(MOCK_POOL_ID);
          expect(swapEvent.args.swap.assetIn).to.equal(mocks.mockWETH.address);
          expect(swapEvent.args.swap.assetOut).to.equal(mocks.mockRETH.address);
          expect(swapEvent.args.swap.amount).to.equal("100".ether);
          expect(swapEvent.args.swap.kind).to.equal("0".ether); // GIVEN_IN

          expect(swapEvent.args.funds.sender).to.equal(router.address);
          expect(swapEvent.args.funds.fromInternalBalance).to.equal(false);
          expect(swapEvent.args.funds.recipient).to.equal(accounts.owner.address);
          expect(swapEvent.args.funds.toInternalBalance).to.equal(false);

          expect(swapEvent.args.limit).to.equal("0".ether);

          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;
    });

    it("Should split swaps up correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swap("50".ether, "50".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event for balancer
      let foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockBalancerVault.address) {
          const swapEvent = mocks.mockBalancerVault.interface.parseLog(event);
          expect(swapEvent.args.swap.amount).to.equal("50".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;

      // Find and verify the mock event for uniswap
      foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockUniswapRouter.address) {
          const swapEvent = mocks.mockUniswapRouter.interface.parseLog(event);
          expect(swapEvent.args.evt.amountIn).to.equal("50".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;
    });

    it("Should split excess beyond deposit pool limit correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 50 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("50".ether);

      // Do a swap
      const tx = await router.swap("50".ether, "50".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event for deposit pool
      let foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockDepositPool.address) {
          const swapEvent = mocks.mockDepositPool.interface.parseLog(event);
          expect(swapEvent.args.amount).to.equal("50".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;

      // Find and verify the mock event for balancer
      foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockBalancerVault.address) {
          const swapEvent = mocks.mockBalancerVault.interface.parseLog(event);
          expect(swapEvent.args.swap.amount).to.equal("25".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;

      // Find and verify the mock event for uniswap
      foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockUniswapRouter.address) {
          const swapEvent = mocks.mockUniswapRouter.interface.parseLog(event);
          expect(swapEvent.args.evt.amountIn).to.equal("25".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;
    });

    it("Should not use deposit pool for swaps < 0.01 ETH", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Do a swap
      const tx = await router.swap("100".ether, "0".ether, "0.009".ether, { value: "0.009".ether });
      const receipt = await tx.wait();

      // Should have sent the entire 0.009 to Uniswap
      let foundEvent = false;
      for (const event of receipt.events) {
        if (event.address === mocks.mockUniswapRouter.address) {
          const swapEvent = mocks.mockUniswapRouter.interface.parseLog(event);
          expect(swapEvent.args.evt.amountIn).to.equal("0.009".ether);
          foundEvent = true;
        }
      }
      expect(foundEvent).to.be.true;
    });
  });
});
