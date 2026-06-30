use soroban_sdk::{contractevent, Address, Env};

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCreated {
    pub stream_id: u64,
    pub employer: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount_per_installment: i128,
    pub frequency: u64,
    pub total_installments: u32,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DepositReceived {
    pub stream_id: u64,
    pub employer: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentUnlocked {
    pub stream_id: u64,
    pub payment_id: u32,
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentClaimed {
    pub stream_id: u64,
    pub payment_id: u32,
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamPaused {
    pub stream_id: u64,
    pub caller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamResumed {
    pub stream_id: u64,
    pub caller: Address,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StreamCancelled {
    pub stream_id: u64,
    pub employer: Address,
    pub refunded_amount: i128,
}

pub fn stream_created(
    env: &Env,
    stream_id: u64,
    employer: Address,
    recipient: Address,
    token: Address,
    amount_per_installment: i128,
    frequency: u64,
    total_installments: u32,
) {
    StreamCreated {
        stream_id,
        employer,
        recipient,
        token,
        amount_per_installment,
        frequency,
        total_installments,
    }
    .publish(env);
}

pub fn deposit_received(env: &Env, stream_id: u64, employer: Address, amount: i128) {
    DepositReceived {
        stream_id,
        employer,
        amount,
    }
    .publish(env);
}

pub fn payment_unlocked(env: &Env, stream_id: u64, payment_id: u32, recipient: Address, amount: i128) {
    PaymentUnlocked {
        stream_id,
        payment_id,
        recipient,
        amount,
    }
    .publish(env);
}

pub fn payment_claimed(env: &Env, stream_id: u64, payment_id: u32, recipient: Address, amount: i128) {
    PaymentClaimed {
        stream_id,
        payment_id,
        recipient,
        amount,
    }
    .publish(env);
}

pub fn stream_paused(env: &Env, stream_id: u64, caller: Address) {
    StreamPaused { stream_id, caller }.publish(env);
}

pub fn stream_resumed(env: &Env, stream_id: u64, caller: Address) {
    StreamResumed { stream_id, caller }.publish(env);
}

pub fn stream_cancelled(env: &Env, stream_id: u64, employer: Address, refunded_amount: i128) {
    StreamCancelled {
        stream_id,
        employer,
        refunded_amount,
    }
    .publish(env);
}
