use crate::storage;
use soroban_sdk::{Address, Env};

pub fn is_admin(env: &Env, address: &Address) -> bool {
    let admin = storage::get_admin(env);
    *address == admin
}

pub fn require_admin(env: &Env, address: &Address) {
    address.require_auth();
    assert!(is_admin(env, address), "only admin can perform this action");
}
