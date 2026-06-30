import {
  rpc,
  xdr,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  Account,
} from "@stellar/stellar-sdk";
import {
  isConnected,
  requestAccess,
  getAddress,
  signTransaction,
} from "@stellar/freighter-api";

export const NETWORK_PASSPHRASE = "Test SDF Network ; October 2015";
export const SOROBAN_RPC_URL = "https://soroban-testnet.stellar.org";
export const CONTRACT_ID =
  process.env.NEXT_PUBLIC_CONTRACT_ID ||
  "CCBA4PL4L4A2QY4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2XZ3Z5YXZ6Z7Z2Y4QZJ2X";

const server = new rpc.Server(SOROBAN_RPC_URL);

// ---------------------------------------------------------------------------
// Wallet helpers
// ---------------------------------------------------------------------------

export async function checkFreighterConnection(): Promise<boolean> {
  try {
    const res = await isConnected();
    return !!res.isConnected;
  } catch {
    return false;
  }
}

export async function getUserPublicKey(): Promise<string | null> {
  try {
    if (!(await checkFreighterConnection())) return null;
    const access = await requestAccess();
    if (access.error) {
      console.error("Access request failed:", access.error);
      return null;
    }
    const { address, error } = await getAddress();
    if (error) {
      console.error("Error retrieving address:", error);
      return null;
    }
    return address || null;
  } catch (err) {
    console.error("Freighter public key retrieval failed:", err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Read-only contract call (simulation only)
// ---------------------------------------------------------------------------

export async function callContractRead(
  functionName: string,
  args: xdr.ScVal[] = []
): Promise<unknown> {
  const contract = new Contract(CONTRACT_ID);

  // A dummy source account is fine for simulations – no auth required.
  const dummyAddress = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
  const sourceAccount = new Account(dummyAddress, "0");

  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(30)
    .build();

  const simResult = await server.simulateTransaction(tx);

  if (rpc.Api.isSimulationSuccess(simResult) && simResult.result) {
    return scValToNative(simResult.result.retval);
  }

  throw new Error(`Simulation failed: ${JSON.stringify(simResult)}`);
}

// ---------------------------------------------------------------------------
// State-mutating contract call (sign + submit + poll)
// ---------------------------------------------------------------------------

export async function callContractWrite(
  functionName: string,
  args: xdr.ScVal[],
  userAddress: string
): Promise<unknown> {
  const contract = new Contract(CONTRACT_ID);

  // 1. Fetch live account details (required for the sequence number).
  const sourceAccount = await server.getAccount(userAddress);

  // 2. Build the initial transaction.
  const tx = new TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(functionName, ...args))
    .setTimeout(60)
    .build();

  // 3. Simulate & prepare (adds soroban resource fees + footprint).
  const preparedTx = await server.prepareTransaction(tx);

  // 4. Request Freighter signature.
  const { signedTxXdr, error: signError } = await signTransaction(
    preparedTx.toXDR(),
    { networkPassphrase: NETWORK_PASSPHRASE }
  );

  if (signError) {
    throw new Error(`Freighter signing failed: ${signError}`);
  }
  if (!signedTxXdr) {
    throw new Error("No signed XDR returned from Freighter");
  }

  // 5. Submit the signed transaction.
  const sendResponse = await server.sendTransaction(
    TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE)
  );

  if (sendResponse.status === "ERROR") {
    throw new Error(
      `Transaction submission error: ${JSON.stringify(sendResponse.errorResult)}`
    );
  }

  const txHash = sendResponse.hash;

  // 6. Poll until the transaction is confirmed or failed.
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const txResponse = await server.getTransaction(txHash);

    if (txResponse.status === rpc.Api.GetTransactionStatus.SUCCESS) {
      // Narrowed to GetSuccessfulTransactionResponse.
      // returnValue is already parsed as xdr.ScVal (or undefined for void fns).
      return txResponse.returnValue
        ? scValToNative(txResponse.returnValue)
        : null;
    }

    if (txResponse.status === rpc.Api.GetTransactionStatus.FAILED) {
      throw new Error("Transaction execution failed on-ledger");
    }

    // GetTransactionStatus.NOT_FOUND → still pending, keep polling.
  }
}

// ---------------------------------------------------------------------------
// Typed contract function wrappers
// ---------------------------------------------------------------------------

export async function initializeContract(
  admin: string,
  treasury: string,
  token: string,
  userAddress: string
) {
  return callContractWrite(
    "initialize",
    [
      nativeToScVal(admin, { type: "address" }),
      nativeToScVal(treasury, { type: "address" }),
      nativeToScVal(token, { type: "address" }),
    ],
    userAddress
  );
}

export async function createStream(
  employer: string,
  recipient: string,
  token: string,
  amountPerInstallment: bigint,
  frequency: bigint,
  totalInstallments: number,
  startTime: bigint,
  userAddress: string
) {
  return callContractWrite(
    "create_stream",
    [
      nativeToScVal(employer, { type: "address" }),
      nativeToScVal(recipient, { type: "address" }),
      nativeToScVal(token, { type: "address" }),
      nativeToScVal(amountPerInstallment, { type: "i128" }),
      nativeToScVal(frequency, { type: "u64" }),
      nativeToScVal(totalInstallments, { type: "u32" }),
      nativeToScVal(startTime, { type: "u64" }),
    ],
    userAddress
  );
}

export async function depositFunds(
  streamId: bigint,
  amount: bigint,
  userAddress: string
) {
  return callContractWrite(
    "deposit",
    [
      nativeToScVal(streamId, { type: "u64" }),
      nativeToScVal(amount, { type: "i128" }),
    ],
    userAddress
  );
}

export async function claimInstallment(
  streamId: bigint,
  paymentId: number,
  userAddress: string
) {
  return callContractWrite(
    "claim",
    [
      nativeToScVal(streamId, { type: "u64" }),
      nativeToScVal(paymentId, { type: "u32" }),
    ],
    userAddress
  );
}

export async function cancelStream(streamId: bigint, userAddress: string) {
  return callContractWrite(
    "cancel_stream",
    [nativeToScVal(streamId, { type: "u64" })],
    userAddress
  );
}

export async function pauseStream(streamId: bigint, userAddress: string) {
  return callContractWrite(
    "pause_stream",
    [nativeToScVal(streamId, { type: "u64" })],
    userAddress
  );
}

export async function resumeStream(streamId: bigint, userAddress: string) {
  return callContractWrite(
    "resume_stream",
    [nativeToScVal(streamId, { type: "u64" })],
    userAddress
  );
}

export async function getStreamDetails(streamId: bigint) {
  return callContractRead("get_stream", [
    nativeToScVal(streamId, { type: "u64" }),
  ]);
}

export async function listStreams(startId: bigint, limit: number) {
  return callContractRead("list_streams", [
    nativeToScVal(startId, { type: "u64" }),
    nativeToScVal(limit, { type: "u32" }),
  ]);
}

export async function listUserStreams(user: string) {
  return callContractRead("list_user_streams", [
    nativeToScVal(user, { type: "address" }),
  ]);
}

export async function listEmployerStreams(employer: string) {
  return callContractRead("list_employer_streams", [
    nativeToScVal(employer, { type: "address" }),
  ]);
}

export async function getTotalLocked(tokenAddress: string) {
  return callContractRead("total_locked", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}

export async function getContractBalance(tokenAddress: string) {
  return callContractRead("contract_balance", [
    nativeToScVal(tokenAddress, { type: "address" }),
  ]);
}
