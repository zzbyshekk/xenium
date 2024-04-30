use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    pubkey::Pubkey,
    signature::{Signer, read_keypair_file},
    transaction::Transaction,
    instruction::{Instruction, AccountMeta},
    compute_budget::ComputeBudgetInstruction,
};
use clap::{App, Arg};
use std::process;
use std::str::FromStr;
use solana_sdk::system_program;
use byteorder::{ByteOrder, LittleEndian};
use borsh::{BorshSerialize, BorshDeserialize};
use ethaddr::Address;
use colored::*;
use std::thread;


#[derive(BorshSerialize, BorshDeserialize)]
struct InstructionData {
    data: Vec<u8>,
}

fn main() {
    let matches = App::new("Solana Transaction Executor")
        .version("0.1.0")
        .author("Your Name <your_email@example.com>")
        .about("Executes a transaction with an Ethereum address on Solana")
        .arg(Arg::with_name("fee")
             .long("fee")
             .value_name("FEE")
             .help("Priority fee per compute unit")
             .takes_value(true)
             .required(true))
        .arg(Arg::with_name("address")
             .long("address")
             .value_name("ADDRESS")
             .help("Ethereum address for the transaction data")
             .takes_value(true)
             .required(true))
        .get_matches();

    
    //let ethereum_address: String = matches.value_of("address").unwrap().to_string();
    

    // Use ethaddr to parse and validate the Ethereum address with checksum
    let _address = match Address::from_str_checksum(&ethereum_address) {
        Ok(addr) => addr,
        Err(_) => {
            eprintln!("Invalid checksummed Ethereum address: {}", ethereum_address);
            process::exit(1);
        }
    };
    
    let handles: Vec<_> = (0..10).map(|_| {
        let priority_fee: u64 = matches.value_of("fee").unwrap().parse().expect("Fee must be a number");
        let ethereum_address: String = matches.value_of("address").unwrap().trim_start_matches("0x").to_string();

        thread::spawn(move || {
            // Logika wysyłania transakcji
            execute_transaction(&ethereum_address, priority_fee);
            println!("Wysyłanie transakcji dla adresu {} z opłatą priorytetową {}", ethereum_address, priority_fee);
        })
    }).collect();

    for handle in handles {
        handle.join().expect("Wątek nie mógł zakończyć się poprawnie");
    }
    
}

fn execute_transaction(ethereum_address: &str, priority_fee: u64) {
    let url = String::from("https://api.devnet.solana.com");
    //let url = String::from("http://127.0.0.1:8899");
    let client = RpcClient::new(url);
    let keypair_path = String::from("/home/ubuntu/.config/solana/id.json");
    let payer = read_keypair_file(&keypair_path).expect("Failed to read keypair file");

    let program_id = Pubkey::from_str("64SYet8RCT5ayZpMGbhcpk3vmt8UkwjZq8uy8Sd6V46A").unwrap();
    let data_as_bytes = hex::decode(ethereum_address).expect("Failed to decode hex string");
    let instruction_data = InstructionData { data: data_as_bytes.clone() };
    let serialized_data = instruction_data.try_to_vec().unwrap();

    let (counter_pda, _bump_seed) = Pubkey::find_program_address(&[&data_as_bytes], &program_id);
    let system_program_id = system_program::ID;
    let instruction = Instruction::new_with_borsh(
        program_id,
        &serialized_data,
        vec![
            AccountMeta::new(payer.pubkey(), true),
            AccountMeta::new(counter_pda, false),
            AccountMeta::new_readonly(system_program_id, false)
        ]
    );

    let compute_budget_instruction_limit = ComputeBudgetInstruction::set_compute_unit_limit(1_200_000);
    let compute_budget_instruction_price = ComputeBudgetInstruction::set_compute_unit_price(priority_fee);

    let transaction = Transaction::new_signed_with_payer(
        &[compute_budget_instruction_limit, compute_budget_instruction_price, instruction],
        Some(&payer.pubkey()),
        &[&payer],
        client.get_latest_blockhash().unwrap(),
    );

    let result = client.send_and_confirm_transaction(&transaction);
        // Fetch account data
    let account_data = client.get_account_data(&counter_pda).unwrap();

    if account_data.len() >= 4 {
        let read_value = LittleEndian::read_u32(&account_data[0..4]);
        print!("{}", "Total mined hashes so far: ".red().bold());
        print!("{} ", read_value.to_string().green().bold());
    } else {
        println!("{}", "Failed to read data: Account data too small".red());
    }

    match result {
        Ok(signature) => println!("Transaction succeeded with signature: {}", signature.to_string().bright_blue().bold()),
        Err(err) => println!("Transaction failed: {:?}", err.to_string().red()),
    };

}
