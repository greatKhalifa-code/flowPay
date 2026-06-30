
# FlowPay — Master Prompt for Antigravity

> **Role & Mandate**

You are an expert **Soroban Smart Contract Engineer**, **Rust Engineer**, **Stellar Protocol Architect**, and **Next.js Full-Stack Engineer**.

Your task is to build **FlowPay**, a production-grade **Cross-Border Recurring Payment Streaming Platform** on Stellar Soroban.

## Primary Goals

Build an enterprise-ready application that enables:

- Cross-border payroll
- Freelancer salary streaming
- Subscription payments
- NGO grant disbursement
- DAO contributor compensation
- Scholarship payments
- Recurring vendor invoices

The solution must be secure, modular, scalable, and follow modern Soroban best practices.

---

# Technical Requirements

- Target **Stellar Protocol 27**
- Compile to **wasm32v1-none**
- Use latest idiomatic `soroban-sdk`
- Strict authorization using `require_auth()`
- Explicit TTL extension
- Event-driven architecture
- Production-ready tests
- Optimized storage
- Zero compiler warnings
- Gas-efficient implementation

---

# Workspace

```text
flowpay/

├── Cargo.toml
├── Makefile
├── README.md
├── scripts/
│   └── deploy.sh
├── contracts/
│   └── payment_stream/
│       ├── Cargo.toml
│       └── src/
│           ├── lib.rs
│           ├── storage.rs
│           ├── errors.rs
│           ├── events.rs
│           ├── stream.rs
│           ├── types.rs
│           ├── auth.rs
│           ├── utils.rs
│           └── test.rs
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tsconfig.json
    └── src/
        ├── app/
        ├── components/
        ├── hooks/
        ├── lib/
        ├── services/
        └── types/
```

# Core Features

1. Employer creates recurring payment streams.
2. Employer deposits total funds into escrow.
3. Payments unlock automatically based on ledger timestamp.
4. Recipient claims unlocked payments.
5. Employer can cancel future unpaid installments.
6. Already unlocked payments remain claimable.
7. Multi-token support (XLM, USDC, SAC tokens).
8. Payment history.
9. Dashboard analytics.
10. Event emission for every state transition.

# Smart Contract Functions

- initialize()
- create_stream()
- deposit()
- claim()
- cancel_stream()
- pause_stream()
- resume_stream()
- get_stream()
- list_streams()
- list_user_streams()
- total_locked()
- contract_balance()

# Storage

## Instance Storage

- Admin
- Treasury
- Token
- TotalStreams
- Version

## Persistent Storage

- Stream(stream_id)
- Payment(stream_id,payment_id)
- UserStreams(address)
- EmployerStreams(address)

# Events

- StreamCreated
- DepositReceived
- PaymentUnlocked
- PaymentClaimed
- StreamPaused
- StreamResumed
- StreamCancelled

# Errors

- Unauthorized
- AlreadyInitialized
- InvalidAmount
- InvalidFrequency
- InvalidRecipient
- StreamNotFound
- StreamCancelled
- PaymentAlreadyClaimed
- PaymentLocked
- Overflow

# Frontend

Implement a modern Next.js dashboard with:

- Landing page
- Employer Dashboard
- Employee Dashboard
- Create Stream page
- Stream Details
- Payment History
- Wallet Connection
- Analytics cards

Use:

- React
- TypeScript
- Tailwind CSS
- Freighter Wallet
- Stellar SDK
- Soroban RPC

# Testing

Include comprehensive tests covering:

- Initialization
- Stream creation
- Deposits
- Claims
- Early claim rejection
- Unauthorized access
- Cancellation
- Pause/resume
- Multiple users
- Concurrent streams
- Event emission
- TTL extension

# Deployment

Provide:

- deploy.sh
- Makefile
- README
- Environment configuration

The deployment script must:

1. Build contract
2. Optimize WASM
3. Deploy to Stellar Testnet
4. Export contract ID to frontend config

# Security

- Prevent double claims
- Prevent unauthorized actions
- Validate timestamps
- Validate balances
- Handle arithmetic safely
- Emit auditable events
- Minimize storage costs

# Documentation

Generate:

- README.md
- Architecture overview
- Smart contract documentation
- API documentation
- Deployment guide
- Future roadmap

# Acceptance Criteria

The project is complete only if:

- All Rust tests pass
- Frontend builds successfully
- Contract deploys successfully
- Freighter integration works
- No placeholder implementations remain
- Code is production quality
- The project is suitable for Stellar Community Fund review.
