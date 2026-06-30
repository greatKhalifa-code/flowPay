#![no_std]

pub mod auth;
pub mod errors;
pub mod events;
pub mod storage;
pub mod stream;
pub mod types;
pub mod utils;

#[cfg(test)]
mod test;

use crate::errors::ContractError;
use crate::types::Stream;
use soroban_sdk::{contract, contractimpl, Address, Env, Vec};

#[contract]
pub struct PaymentStreamContract;

#[contractimpl]
impl PaymentStreamContract {
    pub fn initialize(env: Env, admin: Address, treasury: Address, token: Address) -> Result<(), ContractError> {
        stream::initialize(&env, admin, treasury, token)
    }

    pub fn create_stream(
        env: Env,
        employer: Address,
        recipient: Address,
        token: Address,
        amount_per_installment: i128,
        frequency: u64,
        total_installments: u32,
        start_time: u64,
    ) -> Result<u64, ContractError> {
        stream::create_stream(
            &env,
            employer,
            recipient,
            token,
            amount_per_installment,
            frequency,
            total_installments,
            start_time,
        )
    }

    pub fn deposit(env: Env, stream_id: u64, amount: i128) -> Result<(), ContractError> {
        stream::deposit(&env, stream_id, amount)
    }

    pub fn claim(env: Env, stream_id: u64, payment_id: u32) -> Result<(), ContractError> {
        stream::claim(&env, stream_id, payment_id)
    }

    pub fn cancel_stream(env: Env, stream_id: u64) -> Result<(), ContractError> {
        stream::cancel_stream(&env, stream_id)
    }

    pub fn pause_stream(env: Env, stream_id: u64) -> Result<(), ContractError> {
        stream::pause_stream(&env, stream_id)
    }

    pub fn resume_stream(env: Env, stream_id: u64) -> Result<(), ContractError> {
        stream::resume_stream(&env, stream_id)
    }

    pub fn get_stream(env: Env, stream_id: u64) -> Option<Stream> {
        stream::get_stream(&env, stream_id)
    }

    pub fn list_streams(env: Env, start_id: u64, limit: u32) -> Vec<Stream> {
        stream::list_streams(&env, start_id, limit)
    }

    pub fn list_user_streams(env: Env, user: Address) -> Vec<Stream> {
        stream::list_user_streams(&env, user)
    }

    pub fn list_employer_streams(env: Env, employer: Address) -> Vec<Stream> {
        stream::list_employer_streams(&env, employer)
    }

    pub fn total_locked(env: Env, token: Address) -> i128 {
        stream::total_locked(&env, token)
    }

    pub fn contract_balance(env: Env, token: Address) -> i128 {
        stream::contract_balance(&env, token)
    }
}
