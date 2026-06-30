use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ContractError {
    Unauthorized = 1,
    AlreadyInitialized = 2,
    InvalidAmount = 3,
    InvalidFrequency = 4,
    InvalidRecipient = 5,
    StreamNotFound = 6,
    StreamCancelled = 7,
    PaymentAlreadyClaimed = 8,
    PaymentLocked = 9,
    Overflow = 10,
}
