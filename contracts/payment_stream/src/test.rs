#![cfg(test)]

use crate::errors::ContractError;
use crate::PaymentStreamContract;
use crate::PaymentStreamContractClient;
use soroban_sdk::testutils::{Address as _, Ledger as _};
use soroban_sdk::{token, Address, Env};

fn setup_test(env: &Env) -> (PaymentStreamContractClient<'_>, Address, Address, Address, Address) {
    env.mock_all_auths();

    let contract_id = env.register(PaymentStreamContract, ());
    let client = PaymentStreamContractClient::new(env, &contract_id);

    let admin = Address::generate(env);
    let treasury = Address::generate(env);
    let employer = Address::generate(env);
    let recipient = Address::generate(env);

    (client, admin, treasury, employer, recipient)
}

#[test]
fn test_initialization() {
    let env = Env::default();
    let (client, admin, treasury, _, _) = setup_test(&env);
    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_sac.address();

    client.initialize(&admin, &treasury, &token_address);

    // Initializing again should fail
    let res = client.try_initialize(&admin, &treasury, &token_address);
    assert!(res.is_err());
}

#[test]
fn test_create_stream_validation() {
    let env = Env::default();
    let (client, admin, treasury, employer, recipient) = setup_test(&env);
    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_sac.address();

    client.initialize(&admin, &treasury, &token_address);

    // Invalid amount
    let res = client.try_create_stream(&employer, &recipient, &token_address, &0, &60, &10, &0);
    assert!(matches!(res, Err(Ok(ContractError::InvalidAmount))));

    // Invalid frequency
    let res = client.try_create_stream(&employer, &recipient, &token_address, &100, &0, &10, &0);
    assert!(matches!(res, Err(Ok(ContractError::InvalidFrequency))));

    // Invalid recipient (recipient == employer)
    let res = client.try_create_stream(&employer, &employer, &token_address, &100, &60, &10, &0);
    assert!(matches!(res, Err(Ok(ContractError::InvalidRecipient))));
}

#[test]
fn test_deposit_and_claim_flow() {
    let env = Env::default();
    let (client, admin, treasury, employer, recipient) = setup_test(&env);
    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    client.initialize(&admin, &treasury, &token_address);

    // Mint tokens to employer
    token_admin_client.mint(&employer, &10000);
    assert_eq!(token_client.balance(&employer), 10000);

    // Set timestamp to 1000
    env.ledger().set_timestamp(1000);

    let stream_id = client.create_stream(&employer, &recipient, &token_address, &100, &60, &10, &1000);
    assert_eq!(stream_id, 1);

    // Deposit funds
    client.deposit(&stream_id, &1000);
    assert_eq!(client.total_locked(&token_address), 1000);
    assert_eq!(client.contract_balance(&token_address), 1000);

    // Attempt to claim early (at t = 1010, interval is 60s, so unlock is at t = 1060)
    env.ledger().set_timestamp(1010);
    let res = client.try_claim(&stream_id, &0);
    assert!(matches!(res, Err(Ok(ContractError::PaymentLocked))));

    // Claim at t = 1060
    env.ledger().set_timestamp(1060);
    client.claim(&stream_id, &0);

    assert_eq!(token_client.balance(&recipient), 100);
    assert_eq!(client.total_locked(&token_address), 900);
    assert_eq!(client.contract_balance(&token_address), 900);

    // Claiming again should fail
    let res = client.try_claim(&stream_id, &0);
    assert!(matches!(res, Err(Ok(ContractError::PaymentAlreadyClaimed))));
}

#[test]
fn test_pause_resume() {
    let env = Env::default();
    let (client, admin, treasury, employer, recipient) = setup_test(&env);
    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_sac.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    client.initialize(&admin, &treasury, &token_address);
    token_admin_client.mint(&employer, &1000);

    env.ledger().set_timestamp(1000);
    let stream_id = client.create_stream(&employer, &recipient, &token_address, &100, &60, &5, &1000);
    client.deposit(&stream_id, &500);

    // At t = 1030, pause the stream. Unlocking 1st payment needs 60s (t = 1060).
    env.ledger().set_timestamp(1030);
    client.pause_stream(&stream_id);

    // Advance to t = 1090. If it wasn't paused, 1st payment would unlock. But it is paused.
    env.ledger().set_timestamp(1090);
    let res = client.try_claim(&stream_id, &0);
    assert!(matches!(res, Err(Ok(ContractError::PaymentLocked))));

    // Resume at t = 1100. Pause duration = 1100 - 1030 = 70s.
    // The nominal unlock time for 1st payment shifts by 70s: 1000 + 60 + 70 = 1130.
    env.ledger().set_timestamp(1100);
    client.resume_stream(&stream_id);

    // Try claiming at t = 1120 (unlocked at 1130).
    env.ledger().set_timestamp(1120);
    let res = client.try_claim(&stream_id, &0);
    assert!(matches!(res, Err(Ok(ContractError::PaymentLocked))));

    // Claim at t = 1130.
    env.ledger().set_timestamp(1130);
    client.claim(&stream_id, &0);
}

#[test]
fn test_cancellation() {
    let env = Env::default();
    let (client, admin, treasury, employer, recipient) = setup_test(&env);
    let token_admin = Address::generate(&env);
    let token_sac = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_address = token_sac.address();
    let token_client = token::Client::new(&env, &token_address);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_address);

    client.initialize(&admin, &treasury, &token_address);
    token_admin_client.mint(&employer, &1000);

    env.ledger().set_timestamp(1000);
    let stream_id = client.create_stream(&employer, &recipient, &token_address, &100, &60, &5, &1000);
    client.deposit(&stream_id, &500);

    // Advance to t = 1070 (1st installment unlocked, 2nd locked).
    env.ledger().set_timestamp(1070);

    // Cancel stream.
    client.cancel_stream(&stream_id);

    // Employer should get refunded 400
    assert_eq!(token_client.balance(&employer), 900); // 1000 - 500 (deposit) + 400 (refund)
    assert_eq!(client.total_locked(&token_address), 100);

    // Recipient can claim the unlocked 1st payment.
    client.claim(&stream_id, &0);
    assert_eq!(token_client.balance(&recipient), 100);

    // Recipient cannot claim the 2nd payment.
    let res = client.try_claim(&stream_id, &1);
    assert!(res.is_err());
}
