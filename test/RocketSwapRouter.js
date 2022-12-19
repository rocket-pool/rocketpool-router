const { time, loadFixture } = require("@nomicfoundation/hardhat-network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");

String.prototype.__defineGetter__("ether", function () {
  return ethers.utils.parseEther(this.toString());
});

String.prototype.__defineGetter__("BN", function () {
  return ethers.BigNumber.from(this.toString());
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
    const mockBalancerVault = await MockBalancerVault.deploy(mockRETH.address, mockWETH.address);

    const MockUniswapRouter = await ethers.getContractFactory("MockUniswapRouter");
    const mockUniswapRouter = await MockUniswapRouter.deploy(mockRETH.address, mockWETH.address);

    const MockUniswapQuoter = await ethers.getContractFactory("MockUniswapQuoter");
    const mockUniswapQuoter = await MockUniswapQuoter.deploy(mockRETH.address, mockWETH.address);

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
      mockUniswapQuoter.address,
      mockBalancerVault.address,
      MOCK_POOL_ID
    );

    await mockRETH.mint(owner.address, "1000".ether);

    await owner.sendTransaction({
      to: mockRETH.address,
      value: "100".ether.toString(),
    });

    await owner.sendTransaction({
      to: mockWETH.address,
      value: "100".ether.toString(),
    });

    await mockRETH.setTotalCollateral("100".ether);

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
        mockUniswapQuoter,
        mockRETH,
        mockWETH,
      },
      router: rocketSwapRouter,
    };
  }

  async function checkDepositPoolEvent(accounts, mocks, router, receipt, amountIn) {
    // Find and verify the mock event for deposit pool
    let foundEvent = false;
    for (const event of receipt.events) {
      if (event.address === mocks.mockDepositPool.address) {
        const depositEvent = mocks.mockDepositPool.interface.parseLog(event);
        if (depositEvent.name !== "Deposit") continue;
        expect(depositEvent.args.amount).to.equal(amountIn);
        foundEvent = true;
      }
    }
    expect(foundEvent).to.be.true;
  }

  async function checkRethBurnEvent(accounts, mocks, router, receipt, amountIn) {
    // Find and verify the mock event for deposit pool
    let foundEvent = false;
    for (const event of receipt.events) {
      if (event.address === mocks.mockRETH.address) {
        const burnEvent = mocks.mockRETH.interface.parseLog(event);
        if (burnEvent.name !== "Burn") continue;
        expect(burnEvent.args.amount).to.equal(amountIn);
        foundEvent = true;
      }
    }
    expect(foundEvent).to.be.true;
  }

  async function checkUniswapEvent(accounts, mocks, router, receipt, amountIn, direction) {
    let foundEvent = false;
    for (const event of receipt.events) {
      if (event.address === mocks.mockUniswapRouter.address) {
        const swapEvent = mocks.mockUniswapRouter.interface.parseLog(event);
        if (swapEvent.name !== "Swap") continue;

        if (direction === 0) {
          expect(swapEvent.args.evt.tokenIn).to.equal(mocks.mockWETH.address);
          expect(swapEvent.args.evt.tokenOut).to.equal(mocks.mockRETH.address);
          expect(swapEvent.args.evt.recipient).to.equal(accounts.owner.address);
        } else {
          expect(swapEvent.args.evt.tokenIn).to.equal(mocks.mockRETH.address);
          expect(swapEvent.args.evt.tokenOut).to.equal(mocks.mockWETH.address);
          expect(swapEvent.args.evt.recipient).to.equal(router.address);
        }
        expect(swapEvent.args.evt.fee).to.equal(500);
        expect(swapEvent.args.evt.amountIn).to.equal(amountIn);
        expect(swapEvent.args.evt.amountOutMinimum).to.equal("0");
        expect(swapEvent.args.evt.sqrtPriceLimitX96).to.equal("0");

        foundEvent = true;
      }
    }
    expect(foundEvent).to.be.true;
  }

  function checkBalancerEvent(accounts, mocks, router, receipt, amountIn, direction) {
    // Find and verify the mock event
    let foundEvent = false;
    for (const event of receipt.events) {
      if (event.address === mocks.mockBalancerVault.address) {
        const swapEvent = mocks.mockBalancerVault.interface.parseLog(event);
        if (swapEvent.name !== "Swap") continue;

        expect(swapEvent.args.swap.poolId).to.equal(MOCK_POOL_ID);
        if (direction === 0) {
          expect(swapEvent.args.swap.assetIn).to.equal(mocks.mockWETH.address);
          expect(swapEvent.args.swap.assetOut).to.equal(mocks.mockRETH.address);

          expect(swapEvent.args.funds.recipient).to.equal(accounts.owner.address);
        } else {
          expect(swapEvent.args.swap.assetIn).to.equal(mocks.mockRETH.address);
          expect(swapEvent.args.swap.assetOut).to.equal(mocks.mockWETH.address);

          expect(swapEvent.args.funds.recipient).to.equal(router.address);
        }
        expect(swapEvent.args.swap.amount).to.equal(amountIn);
        expect(swapEvent.args.swap.kind).to.equal("0".ether); // GIVEN_IN

        expect(swapEvent.args.funds.sender).to.equal(router.address);
        expect(swapEvent.args.funds.fromInternalBalance).to.equal(false);
        expect(swapEvent.args.funds.toInternalBalance).to.equal(false);

        expect(swapEvent.args.limit).to.equal("0".ether);

        foundEvent = true;
      }
    }
    expect(foundEvent).to.be.true;
  }

  describe.only("Optimise", function () {
    it("Should optimise a swap", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      await mocks.mockUniswapQuoter.setRate("0.1".ether);

      // Do a swap
      const tx = await router.callStatic.optimiseSwapTo("50".ether, 10);
      console.log(tx);
    });
  });

  describe("Swap to", function () {
    it("Should use the deposit pool for entire swap if it can provide a better rate", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Do a swap
      const tx = router.swapTo("50".ether, "50".ether, "100".ether, "100".ether, { value: "100".ether });

      // Check results
      await expect(tx)
        .to.changeEtherBalance(accounts.owner, "-100".ether)
        .to.changeTokenBalance(mocks.mockRETH, accounts.owner, "100".ether)
        .to.emit(mocks.mockDepositPool, "Deposit")
        .withArgs("100".ether);
    });

    it("Should not use the deposit pool if it cannot provide a better rate", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Set rate on deposit pool worse
      await mocks.mockDepositPool.setRate("0.9".ether);
      await mocks.mockRETH.setRate("0.9".ether);

      // Do a swap
      const tx = router.swapTo("50".ether, "0".ether, "100".ether, "100".ether, { value: "100".ether });

      // Check results
      await expect(tx)
        .to.changeEtherBalance(accounts.owner, "-100".ether)
        .to.changeTokenBalance(mocks.mockRETH, accounts.owner, "100".ether)
        .to.emit(mocks.mockUniswapRouter, "Swap");
    });

    it("Should revert if minimum output is not met", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Set rate to 0.9 so we only get 90 rETH resulting in a revert
      await mocks.mockDepositPool.setRate("0.9".ether);

      // Do a swap
      const tx = router.swapTo("50".ether, "50".ether, "100".ether, "100".ether, { value: "100".ether });

      // Check results
      await expect(tx).to.be.revertedWithCustomError(router, "LessThanMinimum");
    });

    it("Should use uniswap correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swapTo("100".ether, "0".ether, "100".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event
      await checkUniswapEvent(accounts, mocks, router, receipt, "100".ether, 0);
    });

    it("Should use balancer correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swapTo("0".ether, "100".ether, "100".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock event
      await checkBalancerEvent(accounts, mocks, router, receipt, "100".ether, 0);
    });

    it("Should split swaps up correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Do a swap
      const tx = await router.swapTo("50".ether, "50".ether, "100".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock events
      await checkBalancerEvent(accounts, mocks, router, receipt, "50".ether, 0);
      await checkUniswapEvent(accounts, mocks, router, receipt, "50".ether, 0);
    });

    it("Should split excess beyond deposit pool limit correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 50 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("50".ether);

      // Do a swap
      const tx = await router.swapTo("75".ether, "25".ether, "100".ether, "100".ether, { value: "100".ether });
      const receipt = await tx.wait();

      // Find and verify the mock events
      await checkDepositPoolEvent(accounts, mocks, router, receipt, "50".ether);
      await checkUniswapEvent(accounts, mocks, router, receipt, "37.5".ether, 0);
      await checkBalancerEvent(accounts, mocks, router, receipt, "12.5".ether, 0);
    });

    it("Should not use deposit pool for swaps < 0.01 ETH", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Do a swap
      const tx = await router.swapTo("100".ether, "0".ether, "0.009".ether, "0.009".ether, { value: "0.009".ether });
      const receipt = await tx.wait();

      // Should have sent the entire 0.009 to Uniswap
      await checkUniswapEvent(accounts, mocks, router, receipt, "0.009".ether, 0);
    });
  });

  describe("Swap from", function () {
    it("Should use the burn feature for entire swap if it can provide a better rate", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = router.swapFrom("50".ether, "50".ether, "100".ether, "100".ether, "100".ether);

      // Check results
      await expect(tx)
        .to.changeTokenBalance(mocks.mockRETH, accounts.owner, "-100".ether)
        .to.changeEtherBalance(accounts.owner, "100".ether)
        .to.emit(mocks.mockRETH, "Burn")
        .withArgs("100".ether);
    });

    it("Should revert if minimum output is not met", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Enable deposits and set maximum deposit to 1000 ETH
      await mocks.mockDepositSettings.setDepositEnabled(true);
      await mocks.mockDepositSettings.setMaximumDepositPoolSize("1000".ether);

      // Set rate to 0.9 so we only get 90 rETH resulting in a revert
      await mocks.mockUniswapRouter.setRate("1.1".ether);
      await mocks.mockBalancerVault.setRate("1.1".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = router.swapFrom("50".ether, "50".ether, "100".ether, "110".ether, "100".ether);

      // Check results
      await expect(tx).to.be.revertedWithCustomError(router, "LessThanMinimum");
    });

    it("Should use uniswap correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Prevent protocol burns
      await mocks.mockRETH.setRate("1.1".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = await router.swapFrom("100".ether, "0".ether, "100".ether, "100".ether, "100".ether);
      const receipt = await tx.wait();

      // Find and verify the mock event
      await checkUniswapEvent(accounts, mocks, router, receipt, "100".ether, 1);
    });

    it("Should use balancer correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Prevent protocol burns
      await mocks.mockRETH.setRate("1.1".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = await router.swapFrom("0".ether, "100".ether, "100".ether, "100".ether, "100".ether);
      const receipt = await tx.wait();

      // Find and verify the mock event
      await checkBalancerEvent(accounts, mocks, router, receipt, "100".ether, 1);
    });

    it("Should split swaps up correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Prevent protocol burns
      await mocks.mockRETH.setRate("1.1".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = await router.swapFrom("50".ether, "50".ether, "100".ether, "100".ether, "100".ether);
      const receipt = await tx.wait();

      // Find and verify the mock events
      await checkBalancerEvent(accounts, mocks, router, receipt, "50".ether, 1);
      await checkUniswapEvent(accounts, mocks, router, receipt, "50".ether, 1);
    });

    it("Should split excess beyond deposit pool limit correctly", async function () {
      const { accounts, mocks, router } = await loadFixture(deploy);

      // Set total collateral to 50 ETH
      await mocks.mockRETH.setTotalCollateral("50".ether);

      // Do a swap
      await mocks.mockRETH.approve(router.address, "100".ether);
      const tx = await router.swapFrom("50".ether, "50".ether, "100".ether, "100".ether, "100".ether);
      const receipt = await tx.wait();

      // Find and verify the mock events
      await checkRethBurnEvent(accounts, mocks, router, receipt, "50".ether);
      await checkBalancerEvent(accounts, mocks, router, receipt, "25".ether, 1);
      await checkUniswapEvent(accounts, mocks, router, receipt, "25".ether, 1);
    });
  });
});
