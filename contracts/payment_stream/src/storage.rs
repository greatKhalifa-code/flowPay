use crate::types::{Stream, Payment};
use soroban_sdk::{contracttype, Address, Env, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentKey {
    pub stream_id: u64,
    pub payment_id: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Treasury,
    Token,
    TotalStreams,
    Version,
    Stream(u64),
    Payment(PaymentKey),
    UserStreams(Address),
    EmployerStreams(Address),
    TotalLocked(Address),
}

pub const DAY_IN_LEDGERS: u32 = 17280;
pub const INSTANCE_TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
pub const INSTANCE_TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;
pub const PERSISTENT_TTL_THRESHOLD: u32 = 7 * DAY_IN_LEDGERS;
pub const PERSISTENT_TTL_EXTEND_TO: u32 = 30 * DAY_IN_LEDGERS;

pub fn extend_instance_ttl(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND_TO);
}

pub fn extend_persistent_ttl(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSISTENT_TTL_THRESHOLD, PERSISTENT_TTL_EXTEND_TO);
}

// Admin getters and setters
pub fn has_admin(env: &Env) -> bool {
    extend_instance_ttl(env);
    env.storage().instance().has(&DataKey::Admin)
}

pub fn get_admin(env: &Env) -> Address {
    extend_instance_ttl(env);
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

pub fn set_admin(env: &Env, admin: &Address) {
    env.storage().instance().set(&DataKey::Admin, admin);
    extend_instance_ttl(env);
}

// Treasury
pub fn get_treasury(env: &Env) -> Address {
    extend_instance_ttl(env);
    env.storage().instance().get(&DataKey::Treasury).unwrap()
}

pub fn set_treasury(env: &Env, treasury: &Address) {
    env.storage().instance().set(&DataKey::Treasury, treasury);
    extend_instance_ttl(env);
}

// Token
pub fn get_token(env: &Env) -> Address {
    extend_instance_ttl(env);
    env.storage().instance().get(&DataKey::Token).unwrap()
}

pub fn set_token(env: &Env, token: &Address) {
    env.storage().instance().set(&DataKey::Token, token);
    extend_instance_ttl(env);
}

// TotalStreams
pub fn get_total_streams(env: &Env) -> u64 {
    extend_instance_ttl(env);
    env.storage().instance().get(&DataKey::TotalStreams).unwrap_or(0)
}

pub fn increment_total_streams(env: &Env) -> u64 {
    let next = get_total_streams(env) + 1;
    env.storage().instance().set(&DataKey::TotalStreams, &next);
    extend_instance_ttl(env);
    next
}

// Version
pub fn get_version(env: &Env) -> u32 {
    extend_instance_ttl(env);
    env.storage().instance().get(&DataKey::Version).unwrap_or(1)
}

pub fn set_version(env: &Env, version: u32) {
    env.storage().instance().set(&DataKey::Version, &version);
    extend_instance_ttl(env);
}

// Stream getters and setters
pub fn get_stream(env: &Env, stream_id: u64) -> Option<Stream> {
    let key = DataKey::Stream(stream_id);
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
        Some(env.storage().persistent().get(&key).unwrap())
    } else {
        None
    }
}

pub fn set_stream(env: &Env, stream_id: u64, stream: &Stream) {
    let key = DataKey::Stream(stream_id);
    env.storage().persistent().set(&key, stream);
    extend_persistent_ttl(env, &key);
}

// Payment getters and setters
pub fn get_payment(env: &Env, stream_id: u64, payment_id: u32) -> Option<Payment> {
    let key = DataKey::Payment(PaymentKey { stream_id, payment_id });
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
        Some(env.storage().persistent().get(&key).unwrap())
    } else {
        None
    }
}

pub fn set_payment(env: &Env, stream_id: u64, payment_id: u32, payment: &Payment) {
    let key = DataKey::Payment(PaymentKey { stream_id, payment_id });
    env.storage().persistent().set(&key, payment);
    extend_persistent_ttl(env, &key);
}

// UserStreams
pub fn get_user_streams(env: &Env, user: &Address) -> Vec<u64> {
    let key = DataKey::UserStreams(user.clone());
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
        env.storage().persistent().get(&key).unwrap()
    } else {
        Vec::new(env)
    }
}

pub fn add_user_stream(env: &Env, user: &Address, stream_id: u64) {
    let key = DataKey::UserStreams(user.clone());
    let mut streams = get_user_streams(env, user);
    streams.push_back(stream_id);
    env.storage().persistent().set(&key, &streams);
    extend_persistent_ttl(env, &key);
}

// EmployerStreams
pub fn get_employer_streams(env: &Env, employer: &Address) -> Vec<u64> {
    let key = DataKey::EmployerStreams(employer.clone());
    if env.storage().persistent().has(&key) {
        extend_persistent_ttl(env, &key);
        env.storage().persistent().get(&key).unwrap()
    } else {
        Vec::new(env)
    }
}

pub fn add_employer_stream(env: &Env, employer: &Address, stream_id: u64) {
    let key = DataKey::EmployerStreams(employer.clone());
    let mut streams = get_employer_streams(env, employer);
    streams.push_back(stream_id);
    env.storage().persistent().set(&key, &streams);
    extend_persistent_ttl(env, &key);
}

// TotalLocked
pub fn get_total_locked(env: &Env, token: &Address) -> i128 {
    let key = DataKey::TotalLocked(token.clone());
    extend_instance_ttl(env);
    env.storage().instance().get(&key).unwrap_or(0)
}

pub fn set_total_locked(env: &Env, token: &Address, amount: i128) {
    let key = DataKey::TotalLocked(token.clone());
    env.storage().instance().set(&key, &amount);
    extend_instance_ttl(env);
}
