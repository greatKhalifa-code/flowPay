use crate::errors::ContractError;
use crate::events;
use crate::storage;
use crate::types::{Stream, Payment};
use crate::utils::{safe_add, safe_mul};
use soroban_sdk::{token, Address, Env, Vec};

pub fn initialize(env: &Env, admin: Address, treasury: Address, token: Address) -> Result<(), ContractError> {
    if storage::has_admin(env) {
        return Err(ContractError::AlreadyInitialized);
    }
    storage::set_admin(env, &admin);
    storage::set_treasury(env, &treasury);
    storage::set_token(env, &token);
    storage::set_version(env, 1);
    Ok(())
}

pub fn create_stream(
    env: &Env,
    employer: Address,
    recipient: Address,
    token: Address,
    amount_per_installment: i128,
    frequency: u64,
    total_installments: u32,
    start_time: u64,
) -> Result<u64, ContractError> {
    employer.require_auth();

    if amount_per_installment <= 0 {
        return Err(ContractError::InvalidAmount);
    }
    if frequency == 0 {
        return Err(ContractError::InvalidFrequency);
    }
    if total_installments == 0 {
        return Err(ContractError::InvalidAmount);
    }
    if employer == recipient {
        return Err(ContractError::InvalidRecipient);
    }

    let actual_start_time = if start_time == 0 {
        env.ledger().timestamp()
    } else {
        start_time
    };

    let stream_id = storage::increment_total_streams(env);

    let stream = Stream {
        id: stream_id,
        employer: employer.clone(),
        recipient: recipient.clone(),
        token: token.clone(),
        amount_per_installment,
        frequency,
        total_installments,
        installments_claimed: 0,
        start_time: actual_start_time,
        paused_at: 0,
        paused_duration: 0,
        cancelled: false,
        total_deposited: 0,
    };

    storage::set_stream(env, stream_id, &stream);

    for payment_id in 0..total_installments {
        let payment = Payment {
            stream_id,
            payment_id,
            amount: amount_per_installment,
            claimed: false,
        };
        storage::set_payment(env, stream_id, payment_id, &payment);
    }

    storage::add_user_stream(env, &recipient, stream_id);
    storage::add_employer_stream(env, &employer, stream_id);

    events::stream_created(
        env,
        stream_id,
        employer,
        recipient,
        token,
        amount_per_installment,
        frequency,
        total_installments,
    );

    Ok(stream_id)
}

pub fn deposit(env: &Env, stream_id: u64, amount: i128) -> Result<(), ContractError> {
    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    let mut stream = storage::get_stream(env, stream_id).ok_or(ContractError::StreamNotFound)?;

    if stream.cancelled {
        return Err(ContractError::StreamCancelled);
    }

    stream.employer.require_auth();

    let token_client = token::Client::new(env, &stream.token);
    token_client.transfer(&stream.employer, &env.current_contract_address(), &amount);

    stream.total_deposited = safe_add(stream.total_deposited, amount)?;
    storage::set_stream(env, stream_id, &stream);

    let current_locked = storage::get_total_locked(env, &stream.token);
    storage::set_total_locked(env, &stream.token, safe_add(current_locked, amount)?);

    events::deposit_received(env, stream_id, stream.employer.clone(), amount);

    Ok(())
}

pub fn claim(env: &Env, stream_id: u64, payment_id: u32) -> Result<(), ContractError> {
    let mut stream = storage::get_stream(env, stream_id).ok_or(ContractError::StreamNotFound)?;
    
    stream.recipient.require_auth();

    if payment_id >= stream.total_installments {
        return Err(ContractError::StreamNotFound);
    }

    let mut payment = storage::get_payment(env, stream_id, payment_id)
        .ok_or(ContractError::StreamNotFound)?;

    if payment.claimed {
        return Err(ContractError::PaymentAlreadyClaimed);
    }

    let t = env.ledger().timestamp();
    let is_unlocked = if stream.paused_at > 0 {
        stream.paused_at >= stream.start_time + (payment_id + 1) as u64 * stream.frequency + stream.paused_duration
    } else {
        t >= stream.start_time + (payment_id + 1) as u64 * stream.frequency + stream.paused_duration
    };

    if !is_unlocked {
        return Err(ContractError::PaymentLocked);
    }

    let required_deposit = safe_mul(
        (stream.installments_claimed + 1) as i128,
        stream.amount_per_installment,
    )?;

    if stream.total_deposited < required_deposit {
        return Err(ContractError::InvalidAmount);
    }

    payment.claimed = true;
    stream.installments_claimed += 1;

    storage::set_payment(env, stream_id, payment_id, &payment);
    storage::set_stream(env, stream_id, &stream);

    let token_client = token::Client::new(env, &stream.token);
    token_client.transfer(&env.current_contract_address(), &stream.recipient, &payment.amount);

    let current_locked = storage::get_total_locked(env, &stream.token);
    storage::set_total_locked(env, &stream.token, crate::utils::safe_sub(current_locked, payment.amount)?);

    events::payment_unlocked(env, stream_id, payment_id, stream.recipient.clone(), payment.amount);
    events::payment_claimed(env, stream_id, payment_id, stream.recipient.clone(), payment.amount);

    Ok(())
}

pub fn cancel_stream(env: &Env, stream_id: u64) -> Result<(), ContractError> {
    let mut stream = storage::get_stream(env, stream_id).ok_or(ContractError::StreamNotFound)?;

    if stream.cancelled {
        return Err(ContractError::StreamCancelled);
    }

    stream.employer.require_auth();

    let t = env.ledger().timestamp();
    let active_time = if stream.paused_at > 0 {
        stream.paused_at.saturating_sub(stream.start_time).saturating_sub(stream.paused_duration)
    } else {
        t.saturating_sub(stream.start_time).saturating_sub(stream.paused_duration)
    };

    let mut unlocked_count = (active_time / stream.frequency) as u32;
    if unlocked_count > stream.total_installments {
        unlocked_count = stream.total_installments;
    }

    let required_deposit = (unlocked_count as i128) * stream.amount_per_installment;
    let refund_amount = stream.total_deposited.saturating_sub(required_deposit);

    if refund_amount > 0 {
        let token_client = token::Client::new(env, &stream.token);
        token_client.transfer(&env.current_contract_address(), &stream.employer, &refund_amount);
        stream.total_deposited = required_deposit;

        let current_locked = storage::get_total_locked(env, &stream.token);
        storage::set_total_locked(env, &stream.token, crate::utils::safe_sub(current_locked, refund_amount)?);
    }

    stream.cancelled = true;
    stream.total_installments = unlocked_count;

    storage::set_stream(env, stream_id, &stream);

    events::stream_cancelled(env, stream_id, stream.employer.clone(), refund_amount);

    Ok(())
}

pub fn pause_stream(env: &Env, stream_id: u64) -> Result<(), ContractError> {
    let mut stream = storage::get_stream(env, stream_id).ok_or(ContractError::StreamNotFound)?;

    if stream.cancelled {
        return Err(ContractError::StreamCancelled);
    }
    if stream.paused_at > 0 {
        return Err(ContractError::Unauthorized);
    }

    stream.employer.require_auth();

    stream.paused_at = env.ledger().timestamp();
    storage::set_stream(env, stream_id, &stream);

    events::stream_paused(env, stream_id, stream.employer.clone());

    Ok(())
}

pub fn resume_stream(env: &Env, stream_id: u64) -> Result<(), ContractError> {
    let mut stream = storage::get_stream(env, stream_id).ok_or(ContractError::StreamNotFound)?;

    if stream.cancelled {
        return Err(ContractError::StreamCancelled);
    }
    if stream.paused_at == 0 {
        return Err(ContractError::Unauthorized);
    }

    stream.employer.require_auth();

    let t = env.ledger().timestamp();
    let elapsed = t.saturating_sub(stream.paused_at);
    stream.paused_duration = stream.paused_duration.saturating_add(elapsed);
    stream.paused_at = 0;

    storage::set_stream(env, stream_id, &stream);

    events::stream_resumed(env, stream_id, stream.employer.clone());

    Ok(())
}

pub fn get_stream(env: &Env, stream_id: u64) -> Option<Stream> {
    storage::get_stream(env, stream_id)
}

pub fn list_streams(env: &Env, start_id: u64, limit: u32) -> Vec<Stream> {
    let total = storage::get_total_streams(env);
    let mut result = Vec::new(env);
    if total == 0 || limit == 0 {
        return result;
    }
    let end = core::cmp::min(total, start_id + limit as u64 - 1);
    for id in start_id..=end {
        if let Some(stream) = storage::get_stream(env, id) {
            result.push_back(stream);
        }
    }
    result
}

pub fn list_user_streams(env: &Env, user: Address) -> Vec<Stream> {
    let ids = storage::get_user_streams(env, &user);
    let mut result = Vec::new(env);
    for id in ids.iter() {
        if let Some(stream) = storage::get_stream(env, id) {
            result.push_back(stream);
        }
    }
    result
}

pub fn list_employer_streams(env: &Env, employer: Address) -> Vec<Stream> {
    let ids = storage::get_employer_streams(env, &employer);
    let mut result = Vec::new(env);
    for id in ids.iter() {
        if let Some(stream) = storage::get_stream(env, id) {
            result.push_back(stream);
        }
    }
    result
}

pub fn total_locked(env: &Env, token: Address) -> i128 {
    storage::get_total_locked(env, &token)
}

pub fn contract_balance(env: &Env, token: Address) -> i128 {
    let token_client = token::Client::new(env, &token);
    token_client.balance(&env.current_contract_address())
}
