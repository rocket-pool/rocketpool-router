#!/bin/bash

trap cleanup EXIT

cleanup() {
  kill -9 $HARDHAT_PID
}

# Fire up a forked instance of hardhat node
node_modules/.bin/hardhat node --fork $FORK_RPC_URL --port 8545 >/dev/null &
HARDHAT_PID=$!

# Give hardhat node 5 seconds to start up
sleep 5

# Execute our test script
node -r ts-node/register scripts/fork-test.ts
