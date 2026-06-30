use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Stream {
    pub id: u64,
    pub employer: Address,
    pub recipient: Address,
    pub token: Address,
    pub amount_per_installment: i128,
    pub frequency: u64, // frequency in seconds
    pub total_installments: u32,
    pub installments_claimed: u32,
    pub start_time: u64,
    pub paused_at: u64, // 0 if not paused, otherwise timestamp when paused
    pub paused_duration: u64, // accumulated pause duration in seconds
    pub cancelled: bool,
    pub total_deposited: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Payment {
    pub stream_id: u64,
    pub payment_id: u32,
    pub amount: i128,
    pub claimed: bool,
}
