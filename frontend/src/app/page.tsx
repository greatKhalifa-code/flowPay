"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Wallet,
  Play,
  Pause,
  XCircle,
  PlusCircle,
  TrendingUp,
  Clock,
  Shield,
  Layers,
  ArrowRight,
  CheckCircle,
  Globe,
  AlertTriangle,
} from "lucide-react";
import {
  checkFreighterConnection,
  getUserPublicKey,
  createStream as liveCreateStream,
  depositFunds as liveDepositFunds,
  claimInstallment as liveClaimInstallment,
  cancelStream as liveCancelStream,
  pauseStream as livePauseStream,
  resumeStream as liveResumeStream,
  listEmployerStreams as liveListEmployerStreams,
  listUserStreams as liveListUserStreams,
  getTotalLocked as liveGetTotalLocked,
} from "@/lib/stellar";

interface Stream {
  id: string;
  employer: string;
  recipient: string;
  token: string;
  amountPerInstallment: number;
  frequency: number; // in seconds
  totalInstallments: number;
  installmentsClaimed: number;
  startTime: number; // timestamp in ms
  pausedAt: number; // timestamp in ms, 0 if active
  pausedDuration: number; // in ms
  cancelled: boolean;
  totalDeposited: number;
}

export default function FlowPayDashboard() {
  const [activeTab, setActiveTab] = useState<"landing" | "employer" | "employee" | "create" | "admin">("landing");
  const [mode, setMode] = useState<"sandbox" | "testnet">("sandbox");
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [isWalletConnecting, setIsWalletConnecting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);
  const [now, setNow] = useState(Date.now());

  // Form states for creating a new stream
  const [formRecipient, setFormRecipient] = useState("");
  const [formToken, setFormToken] = useState("USDC");
  const [formAmount, setFormAmount] = useState("");
  const [formFrequency, setFormFrequency] = useState("10"); // default 10 seconds for demo
  const [formInstallments, setFormInstallments] = useState("10");
  const [formDeposit, setFormDeposit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Global Sandbox Token Balance state for claiming simulation
  const [sandboxBalances, setSandboxBalances] = useState<Record<string, number>>({
    USDC: 5000,
    XLM: 20000,
    EURC: 1500,
  });

  // Sandbox Streams state
  const [sandboxStreams, setSandboxStreams] = useState<Stream[]>([
    {
      id: "1",
      employer: "GDUSDC...EMPLOYER",
      recipient: "GCRECIPIENT...1111",
      token: "USDC",
      amountPerInstallment: 250,
      frequency: 10,
      totalInstallments: 12,
      installmentsClaimed: 2,
      startTime: Date.now() - 45000, // started 45 seconds ago
      pausedAt: 0,
      pausedDuration: 0,
      cancelled: false,
      totalDeposited: 3000,
    },
    {
      id: "2",
      employer: "GDUSDC...EMPLOYER",
      recipient: "GCRECIPIENT...2222",
      token: "XLM",
      amountPerInstallment: 1000,
      frequency: 15,
      totalInstallments: 5,
      installmentsClaimed: 0,
      startTime: Date.now() - 10000, // started 10 seconds ago
      pausedAt: 0,
      pausedDuration: 0,
      cancelled: false,
      totalDeposited: 5000,
    },
    {
      id: "3",
      employer: "GDUSDC...EMPLOYER",
      recipient: "GCRECIPIENT...1111", // same user as recipient 1
      token: "EURC",
      amountPerInstallment: 100,
      frequency: 30,
      totalInstallments: 8,
      installmentsClaimed: 1,
      startTime: Date.now() - 90000,
      pausedAt: Date.now() - 30000, // paused 30 seconds ago
      pausedDuration: 0,
      cancelled: false,
      totalDeposited: 800,
    },
  ]);

  // Testnet Live Streams state
  const [liveStreams, setLiveStreams] = useState<Stream[]>([]);
  const [liveTotalLocked, setLiveTotalLocked] = useState<number>(0);
  const [isLoadingLive, setIsLoadingLive] = useState(false);

  /** Shape of a raw stream object returned by scValToNative from the contract */
  interface RawStreamItem {
    id: bigint | number;
    employer: { toString(): string };
    recipient: { toString(): string };
    token: { toString(): string };
    amount_per_installment: bigint | number;
    frequency: bigint | number;
    total_installments: bigint | number;
    installments_claimed: bigint | number;
    start_time: bigint | number;
    paused_at: bigint | number;
    paused_duration: bigint | number;
    cancelled: boolean;
    total_deposited: bigint | number;
  }

  // Trigger Toast Helper
  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Real-time ticking effect
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Sync Live Data if connected and in testnet mode
  const fetchLiveData = useCallback(async () => {
    if (!connectedAddress || mode !== "testnet") return;
    setIsLoadingLive(true);
    try {
      const empRaw = await liveListEmployerStreams(connectedAddress);
      const recRaw = await liveListUserStreams(connectedAddress);

      const allLive: Stream[] = [];
      const processRaw = (raw: unknown) => {
        if (!Array.isArray(raw)) return;
        (raw as RawStreamItem[]).forEach((item) => {
          allLive.push({
            id: item.id.toString(),
            employer: item.employer.toString(),
            recipient: item.recipient.toString(),
            token: item.token.toString(),
            amountPerInstallment: Number(item.amount_per_installment),
            frequency: Number(item.frequency),
            totalInstallments: Number(item.total_installments),
            installmentsClaimed: Number(item.installments_claimed),
            startTime: Number(item.start_time) * 1000,
            pausedAt: Number(item.paused_at) * 1000,
            pausedDuration: Number(item.paused_duration) * 1000,
            cancelled: item.cancelled,
            totalDeposited: Number(item.total_deposited),
          });
        });
      };

      processRaw(empRaw);
      processRaw(recRaw);

      // Deduplicate by stream id
      const uniqueStreams = allLive.filter(
        (v, i, a) => a.findIndex((t) => t.id === v.id) === i
      );
      setLiveStreams(uniqueStreams);

      if (uniqueStreams.length > 0) {
        const lockedVal = await liveGetTotalLocked(uniqueStreams[0].token);
        setLiveTotalLocked(Number(lockedVal));
      }
    } catch (err: unknown) {
      console.error(err);
      showToast("Failed to load testnet contract data", "error");
    } finally {
      setIsLoadingLive(false);
    }
  }, [connectedAddress, mode, showToast]);

  useEffect(() => {
    if (mode === "testnet" && connectedAddress) {
      void fetchLiveData();
    }
  }, [mode, connectedAddress, fetchLiveData]);

  // Connect Freighter Wallet
  const connectWallet = async () => {
    setIsWalletConnecting(true);
    try {
      const hasFreighter = await checkFreighterConnection();
      if (!hasFreighter) {
        showToast("Freighter extension not detected", "error");
        setIsWalletConnecting(false);
        return;
      }
      const pubKey = await getUserPublicKey();
      if (pubKey) {
        setConnectedAddress(pubKey);
        showToast("Freighter wallet connected successfully!", "success");
        if (activeTab === "landing") {
          setActiveTab("employer");
        }
      } else {
        showToast("Wallet authorization cancelled", "error");
      }
    } catch (error) {
      console.error(error);
      showToast("Error connecting wallet", "error");
    } finally {
      setIsWalletConnecting(false);
    }
  };

  // Helper to compute streaming parameters for a stream
  const getStreamMetrics = (stream: Stream) => {
    const start = stream.startTime;
    const freq = stream.frequency * 1000; // to ms
    const amount = stream.amountPerInstallment;
    
    // Active elapsed time calculation
    let elapsed = 0;
    if (stream.pausedAt > 0) {
      elapsed = stream.pausedAt - start - stream.pausedDuration;
    } else {
      elapsed = now - start - stream.pausedDuration;
    }
    
    if (elapsed < 0) elapsed = 0;

    let unlockedCount = Math.floor(elapsed / freq);
    if (unlockedCount > stream.totalInstallments) {
      unlockedCount = stream.totalInstallments;
    }
    if (stream.cancelled) {
      // If cancelled, total installments is already locked to unlocked count
      unlockedCount = stream.totalInstallments;
    }

    const claimableCount = Math.max(0, unlockedCount - stream.installmentsClaimed);
    const unlockedAmount = unlockedCount * amount;
    const claimedAmount = stream.installmentsClaimed * amount;
    const claimableAmount = claimableCount * amount;
    const lockedAmount = Math.max(0, (stream.totalInstallments - unlockedCount) * amount);

    const progress = stream.totalInstallments > 0 ? (unlockedCount / stream.totalInstallments) * 100 : 0;
    
    // Next unlock details
    let timeToNext = 0;
    if (unlockedCount < stream.totalInstallments && !stream.cancelled && stream.pausedAt === 0) {
      const nextUnlockTime = start + (unlockedCount + 1) * freq + stream.pausedDuration;
      timeToNext = Math.max(0, nextUnlockTime - now);
    }

    return {
      unlockedCount,
      claimableCount,
      unlockedAmount,
      claimedAmount,
      claimableAmount,
      lockedAmount,
      progress,
      timeToNext,
    };
  };

  // Handle Create Stream
  const handleCreateStream = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRecipient || !formAmount || !formDeposit) {
      showToast("Please fill in all fields", "error");
      return;
    }

    const amt = parseFloat(formAmount);
    const dep = parseFloat(formDeposit);
    const freq = parseInt(formFrequency);
    const inst = parseInt(formInstallments);

    if (isNaN(amt) || amt <= 0 || isNaN(dep) || dep <= 0) {
      showToast("Amounts must be positive numbers", "error");
      return;
    }

    setIsSubmitting(true);

    if (mode === "sandbox") {
      // Create Mock Stream
      const newStream: Stream = {
        id: (sandboxStreams.length + 1).toString(),
        employer: connectedAddress || "GDUSDC...EMPLOYER",
        recipient: formRecipient,
        token: formToken,
        amountPerInstallment: amt,
        frequency: freq,
        totalInstallments: inst,
        installmentsClaimed: 0,
        startTime: Date.now(),
        pausedAt: 0,
        pausedDuration: 0,
        cancelled: false,
        totalDeposited: dep,
      };

      setSandboxStreams([newStream, ...sandboxStreams]);
      showToast("Sandbox Payment Stream Created!", "success");
      setActiveTab("employer");
      setFormRecipient("");
      setFormAmount("");
      setFormDeposit("");
      setIsSubmitting(false);
    } else {
      // Live Testnet Creation
      if (!connectedAddress) {
        showToast("Please connect your wallet first", "error");
        setIsSubmitting(false);
        return;
      }
      try {
        const streamIdRaw = await liveCreateStream(
          connectedAddress,
          formRecipient,
          formToken, // Address of SAC token on testnet
          BigInt(Math.floor(amt * 10000000)), // convert to 7 decimals
          BigInt(freq),
          inst,
          BigInt(0), // start immediately
          connectedAddress
        );
        const streamId = BigInt(streamIdRaw as bigint | number | string);
        // Deposit
        await liveDepositFunds(
          streamId,
          BigInt(Math.floor(dep * 10000000)),
          connectedAddress
        );

        showToast(`Stream #${streamId} created and funded on Testnet!`, "success");
        await fetchLiveData();
        setActiveTab("employer");
      } catch (err: unknown) {
        console.error(err);
        showToast("Failed to create stream on Testnet", "error");
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  // Claim simulation / execution
  const handleClaim = async (stream: Stream) => {
    const { claimableAmount, claimableCount } = getStreamMetrics(stream);
    if (claimableCount <= 0) {
      showToast("No unlocked funds to claim yet", "error");
      return;
    }

    if (mode === "sandbox") {
      // Simulate claim
      const updated = sandboxStreams.map((s) => {
        if (s.id === stream.id) {
          return {
            ...s,
            installmentsClaimed: s.installmentsClaimed + claimableCount,
          };
        }
        return s;
      });
      setSandboxStreams(updated);
      
      // Update sandbox balance
      setSandboxBalances({
        ...sandboxBalances,
        [stream.token]: sandboxBalances[stream.token] + claimableAmount,
      });

      showToast(`Successfully claimed ${claimableAmount} ${stream.token} to your sandbox wallet!`, "success");
    } else {
      // Live Testnet Claim
      if (!connectedAddress) return;
      try {
        // Claim the latest unclaimed installment
        const nextId = stream.installmentsClaimed;
        await liveClaimInstallment(BigInt(stream.id), nextId, connectedAddress);
        showToast(`Claimed installment #${nextId} successfully!`, "success");
        await fetchLiveData();
      } catch (err) {
        console.error(err);
        showToast("Claim transaction failed", "error");
      }
    }
  };

  // Deposit topup simulation / execution
  const handleDepositTopUp = async (streamId: string, amount: number) => {
    if (mode === "sandbox") {
      setSandboxStreams(
        sandboxStreams.map((s) => {
          if (s.id === streamId) {
            return { ...s, totalDeposited: s.totalDeposited + amount };
          }
          return s;
        })
      );
      showToast(`Deposited additional ${amount} funds to stream #${streamId}`, "success");
    } else {
      if (!connectedAddress) return;
      try {
        await liveDepositFunds(
          BigInt(streamId),
          BigInt(Math.floor(amount * 10000000)),
          connectedAddress
        );
        showToast("Top up deposit successful!", "success");
        await fetchLiveData();
      } catch (err) {
        console.error(err);
        showToast("Deposit failed", "error");
      }
    }
  };

  // Pause simulation / execution
  const handlePause = async (stream: Stream) => {
    if (mode === "sandbox") {
      setSandboxStreams(
        sandboxStreams.map((s) => {
          if (s.id === stream.id) {
            return { ...s, pausedAt: Date.now() };
          }
          return s;
        })
      );
      showToast(`Stream #${stream.id} paused`, "info");
    } else {
      if (!connectedAddress) return;
      try {
        await livePauseStream(BigInt(stream.id), connectedAddress);
        showToast("Stream paused on Testnet", "success");
        await fetchLiveData();
      } catch (err) {
        console.error(err);
        showToast("Pause transaction failed", "error");
      }
    }
  };

  // Resume simulation / execution
  const handleResume = async (stream: Stream) => {
    if (mode === "sandbox") {
      setSandboxStreams(
        sandboxStreams.map((s) => {
          if (s.id === stream.id) {
            const elapsed = Date.now() - s.pausedAt;
            return {
              ...s,
              pausedDuration: s.pausedDuration + elapsed,
              pausedAt: 0,
            };
          }
          return s;
        })
      );
      showToast(`Stream #${stream.id} resumed`, "success");
    } else {
      if (!connectedAddress) return;
      try {
        await liveResumeStream(BigInt(stream.id), connectedAddress);
        showToast("Stream resumed on Testnet", "success");
        await fetchLiveData();
      } catch (err) {
        console.error(err);
        showToast("Resume transaction failed", "error");
      }
    }
  };

  // Cancel simulation / execution
  const handleCancel = async (stream: Stream) => {
    if (mode === "sandbox") {
      const { unlockedCount, unlockedAmount } = getStreamMetrics(stream);
      // Refund calculations
      const refund = Math.max(0, stream.totalDeposited - unlockedAmount);

      setSandboxStreams(
        sandboxStreams.map((s) => {
          if (s.id === stream.id) {
            return {
              ...s,
              cancelled: true,
              totalInstallments: unlockedCount,
              totalDeposited: unlockedAmount,
            };
          }
          return s;
        })
      );

      showToast(`Stream #${stream.id} cancelled. Refunded ${refund} ${stream.token} to employer`, "info");
    } else {
      if (!connectedAddress) return;
      try {
        await liveCancelStream(BigInt(stream.id), connectedAddress);
        showToast("Stream cancelled. Unused funds refunded.", "success");
        await fetchLiveData();
      } catch (err) {
        console.error(err);
        showToast("Cancellation failed", "error");
      }
    }
  };

  const activeStreams = mode === "sandbox" ? sandboxStreams : liveStreams;

  // Calculate totals
  const totalLockedInActiveStreams = activeStreams
    .filter((s) => !s.cancelled)
    .reduce((acc, curr) => {
      const { lockedAmount } = getStreamMetrics(curr);
      return acc + lockedAmount;
    }, 0);

  const totalStreamDeposited = activeStreams.reduce((acc, curr) => acc + curr.totalDeposited, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-violet-500 selection:text-white relative overflow-hidden">
      
      {/* Background Neon Gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[60%] rounded-full bg-violet-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[50%] rounded-full bg-cyan-900/20 blur-[120px] pointer-events-none" />

      {/* Global Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-4 rounded-xl border shadow-2xl backdrop-blur-md animate-bounce ${
          toast.type === "success" 
            ? "bg-emerald-950/80 border-emerald-800 text-emerald-300"
            : toast.type === "error"
            ? "bg-rose-950/80 border-rose-800 text-rose-300"
            : "bg-slate-900/80 border-slate-700 text-sky-300"
        }`}>
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-semibold">{toast.message}</span>
        </div>
      )}

      {/* Navigation Header */}
      <header className="sticky top-0 z-40 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab("landing")}>
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Layers className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
              Flow<span className="text-violet-400">Pay</span>
            </span>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => setActiveTab("landing")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "landing" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab("employer")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "employer" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Employer Dashboard
            </button>
            <button
              onClick={() => setActiveTab("employee")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === "employee" ? "bg-slate-900 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Employee Stream Center
            </button>
          </nav>

          <div className="flex items-center gap-4">
            {/* Mode Switcher */}
            <div className="flex items-center bg-slate-900/60 p-1 rounded-xl border border-slate-800">
              <button
                onClick={() => {
                  setMode("sandbox");
                  showToast("Switched to Sandbox Mode", "info");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === "sandbox" ? "bg-violet-600 text-white shadow-md shadow-violet-600/10" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sandbox
              </button>
              <button
                onClick={() => {
                  setMode("testnet");
                  showToast("Switched to Live Testnet Mode", "info");
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  mode === "testnet" ? "bg-violet-600 text-white shadow-md shadow-violet-600/10" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Stellar Testnet
              </button>
            </div>

            {/* Wallet Button */}
            {connectedAddress ? (
              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
                <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-mono font-medium text-slate-300">
                  {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
                </span>
              </div>
            ) : (
              <button
                onClick={connectWallet}
                disabled={isWalletConnecting}
                className="flex items-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-violet-600/20 hover:shadow-violet-600/30 cursor-pointer"
              >
                <Wallet className="w-4 h-4" />
                {isWalletConnecting ? "Connecting..." : "Connect Wallet"}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-6 py-10 relative">

        {/* Tab 1: Landing Page */}
        {activeTab === "landing" && (
          <div className="space-y-24 py-10">
            {/* Hero Section */}
            <div className="text-center max-w-4xl mx-auto space-y-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-wider">
                <TrendingUp className="w-3.5 h-3.5" /> Next-Gen Continuous Payment Protocol
              </div>
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight leading-[1.1] text-white">
                Stream Wages and Wages Will{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-fuchsia-400 to-cyan-400">
                  Flow in Real-Time
                </span>
              </h1>
              <p className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto leading-relaxed">
                Empower your remote team, freelancers, and contributors with secure, per-second recurring payroll streams built on the high-speed Stellar Soroban network.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <button
                  onClick={() => setActiveTab("employer")}
                  className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-8 py-4 rounded-2xl text-base font-bold transition-all shadow-xl shadow-violet-600/20 hover:scale-105 cursor-pointer"
                >
                  Employer Dashboard <ArrowRight className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setActiveTab("employee")}
                  className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-white px-8 py-4 rounded-2xl text-base font-bold transition-all hover:scale-105 cursor-pointer"
                >
                  Employee Stream Center
                </button>
              </div>
            </div>

            {/* Core Features / Trust Section */}
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 space-y-4 hover:border-slate-800 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center text-violet-400">
                  <Clock className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Continuous Streaming</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Say goodbye to monthly payroll delays. Unlock compensation continuously based on ledger timestamps.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 space-y-4 hover:border-slate-800 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Secure Escrow Vaults</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Funds are locked securely in Soroban-native escrows, with strict multi-sig authorization constraints.
                </p>
              </div>
              <div className="bg-slate-900/40 border border-slate-900 rounded-3xl p-8 space-y-4 hover:border-slate-800 transition-all">
                <div className="w-12 h-12 rounded-2xl bg-fuchsia-500/10 border border-fuchsia-500/20 flex items-center justify-center text-fuchsia-400">
                  <Globe className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-white">Multi-Token Flexibility</h3>
                <p className="text-slate-400 leading-relaxed text-sm">
                  Direct support for USDC, XLM, and custom Stellar Asset Contract tokens with negligible transaction costs.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mode Warn Message for Testnet */}
        {mode === "testnet" && !connectedAddress && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-300 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-sm">Wallet Disconnected</h4>
              <p className="text-xs text-amber-400/80 mt-1">
                You are in Stellar Testnet mode. Please connect your Freighter Wallet using the button in the top right to query or construct live streams on the blockchain.
              </p>
            </div>
          </div>
        )}

        {/* Tab 2: Employer Dashboard */}
        {activeTab === "employer" && (
          <div className="space-y-8">
            
            {/* Top Cards Row */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <div className="bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 space-y-2">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Active Deposited</span>
                <div className="text-3xl font-extrabold text-white flex items-baseline gap-1.5">
                  {totalStreamDeposited.toLocaleString()} <span className="text-sm font-semibold text-violet-400">USD</span>
                </div>
                <span className="text-xs text-slate-400">Across all created streams</span>
              </div>
              <div className="bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 space-y-2">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Currently Locked Escrow</span>
                <div className="text-3xl font-extrabold text-white flex items-baseline gap-1.5">
                  {totalLockedInActiveStreams.toLocaleString()} <span className="text-sm font-semibold text-cyan-400">USD</span>
                </div>
                <span className="text-xs text-slate-400">Locked pending unlocks</span>
              </div>
              <div className="bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 space-y-2">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Total Active Streams</span>
                <div className="text-3xl font-extrabold text-white">
                  {activeStreams.filter(s => !s.cancelled && s.pausedAt === 0).length}
                </div>
                <span className="text-xs text-slate-400">Broadcasting wages</span>
              </div>
              <div className="bg-slate-900/40 border border-slate-900/80 backdrop-blur-md rounded-2xl p-6 space-y-2">
                <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Your Sandbox Balance</span>
                <div className="text-3xl font-extrabold text-white flex items-baseline gap-1.5">
                  {sandboxBalances.USDC.toLocaleString()} <span className="text-sm font-semibold text-fuchsia-400">USDC</span>
                </div>
                <span className="text-xs text-slate-400">Demo claiming reservoir</span>
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center justify-between border-b border-slate-900 pb-5 pt-4">
              <div>
                <h2 className="text-2xl font-bold text-white">Outgoing Payment Streams</h2>
                <p className="text-xs text-slate-400 mt-1">Manage recurring payouts to employees and contractors</p>
              </div>
              <button
                onClick={() => setActiveTab("create")}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" /> Create Payout Stream
              </button>
            </div>

            {/* Streams Grid */}
            <div className="grid md:grid-cols-2 gap-8">
              {activeStreams.map((stream) => {
                const metrics = getStreamMetrics(stream);
                return (
                  <div
                    key={stream.id}
                    className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-3xl p-6 space-y-6 transition-all relative overflow-hidden group"
                  >
                    
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      {stream.cancelled ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-900/50">
                          Cancelled
                        </span>
                      ) : stream.pausedAt > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-900/50">
                          Paused
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 animate-pulse">
                          Streaming
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500">STREAM ID: #{stream.id}</div>
                      <h4 className="text-lg font-bold text-white flex items-center gap-2">
                        {stream.amountPerInstallment} {stream.token}{" "}
                        <span className="text-xs text-slate-400 font-normal">
                          / every {stream.frequency} seconds
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">Recipient: {stream.recipient}</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                        <span>Progress: {metrics.progress.toFixed(0)}%</span>
                        <span>
                          {metrics.unlockedCount} / {stream.totalInstallments} Claims Unlocked
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 rounded-full transition-all duration-1000"
                          style={{ width: `${metrics.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Unlocking Metrics */}
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-5 text-center">
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Deposited</div>
                        <div className="text-sm font-bold text-slate-200 mt-1">
                          {stream.totalDeposited} {stream.token}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Unlocked</div>
                        <div className="text-sm font-bold text-emerald-400 mt-1">
                          {metrics.unlockedAmount} {stream.token}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Claimed</div>
                        <div className="text-sm font-bold text-slate-400 mt-1">
                          {metrics.claimedAmount} {stream.token}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    {!stream.cancelled && (
                      <div className="flex items-center gap-2 border-t border-slate-900 pt-4">
                        {stream.pausedAt > 0 ? (
                          <button
                            onClick={() => handleResume(stream)}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5" /> Resume Stream
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePause(stream)}
                            className="flex-1 flex items-center justify-center gap-2 bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-300 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                          >
                            <Pause className="w-3.5 h-3.5" /> Pause Stream
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(stream)}
                          className="flex-1 flex items-center justify-center gap-2 bg-rose-950/20 hover:bg-rose-950/40 border border-rose-900/50 text-rose-400 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Cancel Stream
                        </button>
                        <button
                          onClick={() => handleDepositTopUp(stream.id, stream.amountPerInstallment * 3)}
                          className="flex-1 flex items-center justify-center gap-2 bg-violet-950/30 hover:bg-violet-950/50 border border-violet-900/50 text-violet-400 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          Top-Up Escrow
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Employee Dashboard */}
        {activeTab === "employee" && (
          <div className="space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Incoming Payment Streams</h2>
              <p className="text-xs text-slate-400 mt-1">Claim wages and payouts that are unlocking dynamically</p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              {activeStreams.map((stream) => {
                const metrics = getStreamMetrics(stream);
                return (
                  <div
                    key={stream.id}
                    className="bg-slate-900/30 border border-slate-900 hover:border-slate-800 rounded-3xl p-6 space-y-6 transition-all relative overflow-hidden"
                  >
                    
                    {/* Status Badge */}
                    <div className="absolute top-4 right-4">
                      {stream.cancelled ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-950/80 text-rose-400 border border-rose-900/50">
                          Cancelled
                        </span>
                      ) : stream.pausedAt > 0 ? (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-950/80 text-amber-400 border border-amber-900/50">
                          Paused
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-900/50 animate-pulse">
                          Streaming
                        </span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="text-xs font-mono text-slate-500">STREAM ID: #{stream.id}</div>
                      <h4 className="text-lg font-bold text-white">
                        {stream.amountPerInstallment} {stream.token}{" "}
                        <span className="text-xs text-slate-400 font-normal">
                          unlocked every {stream.frequency} seconds
                        </span>
                      </h4>
                      <p className="text-xs text-slate-400 font-mono">Employer: {stream.employer}</p>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-400">
                        <span>Progress: {metrics.progress.toFixed(0)}%</span>
                        <span>
                          {metrics.unlockedCount} / {stream.totalInstallments} claims unlocked
                        </span>
                      </div>
                      <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-violet-600 to-cyan-500 rounded-full transition-all duration-1000"
                          style={{ width: `${metrics.progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Unlocking Metrics */}
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-900 pt-5 text-center">
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Total Salary</div>
                        <div className="text-sm font-bold text-slate-200 mt-1">
                          {stream.amountPerInstallment * stream.totalInstallments} {stream.token}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Claimed</div>
                        <div className="text-sm font-bold text-slate-400 mt-1">
                          {metrics.claimedAmount} {stream.token}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500 font-semibold">Claimable Now</div>
                        <div className="text-sm font-bold text-emerald-400 mt-1">
                          {metrics.claimableAmount} {stream.token}
                        </div>
                      </div>
                    </div>

                    {/* Claim Button */}
                    <div className="border-t border-slate-900 pt-4">
                      {metrics.claimableCount > 0 ? (
                        <button
                          onClick={() => handleClaim(stream)}
                          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-violet-600/10 cursor-pointer"
                        >
                          Claim {metrics.claimableAmount} {stream.token} Unlocked
                        </button>
                      ) : (
                        <button
                          disabled
                          className="w-full flex items-center justify-center gap-2 bg-slate-950 border border-slate-900 text-slate-600 py-3 rounded-xl text-sm font-bold transition-all"
                        >
                          {stream.pausedAt > 0
                            ? "Stream Paused by Employer"
                            : stream.cancelled
                            ? "Stream Cancelled"
                            : metrics.unlockedCount >= stream.totalInstallments
                            ? "Fully Claimed"
                            : `Next unlock in ${Math.ceil(metrics.timeToNext / 1000)}s`}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 4: Create Stream */}
        {activeTab === "create" && (
          <div className="max-w-2xl mx-auto space-y-8">
            <div>
              <h2 className="text-2xl font-bold text-white">Create Recurring Stream</h2>
              <p className="text-xs text-slate-400 mt-1">Lock funds into escrow and define the distribution schema</p>
            </div>

            <form onSubmit={handleCreateStream} className="bg-slate-900/30 border border-slate-900 rounded-3xl p-8 space-y-6">
              
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Recipient Address</label>
                <input
                  type="text"
                  placeholder="G..."
                  value={formRecipient}
                  onChange={(e) => setFormRecipient(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Token Type</label>
                  <select
                    value={formToken}
                    onChange={(e) => setFormToken(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                  >
                    <option value="USDC">USDC (Stablecoin)</option>
                    <option value="XLM">XLM (Native Stellar)</option>
                    <option value="EURC">EURC (Euro Stablecoin)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Amount per Installment</label>
                  <input
                    type="number"
                    placeholder="e.g. 100"
                    value={formAmount}
                    onChange={(e) => setFormAmount(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Frequency (seconds)</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={formFrequency}
                    onChange={(e) => setFormFrequency(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-300">Total Installments</label>
                  <input
                    type="number"
                    placeholder="e.g. 10"
                    value={formInstallments}
                    onChange={(e) => setFormInstallments(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-300">Initial Escrow Funding Deposit</label>
                <input
                  type="number"
                  placeholder="Total amount to lock up"
                  value={formDeposit}
                  onChange={(e) => setFormDeposit(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 text-slate-200"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white py-4 rounded-xl text-sm font-bold transition-all shadow-lg shadow-violet-600/10 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Deploy Stream & Deposit Funds"}
              </button>
            </form>
          </div>
        )}

      </main>
    </div>
  );
}
