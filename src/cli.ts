import inquirer from "inquirer";
import { User, UserSchema, Broker } from "./types.js";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "fs";

export async function collectUserInfo(): Promise<User> {
  console.log(chalk.blue.bold("🔒 Data Broker Removal Tool"));
  console.log(chalk.gray("Let's collect your information to remove your data from brokers.\n"));

  const questions = [
    {
      type: "input",
      name: "firstName",
      message: "First Name:",
      validate: (input: string) => input.trim() ? true : "First name is required"
    },
    {
      type: "input",
      name: "lastName",
      message: "Last Name:",
      validate: (input: string) => input.trim() ? true : "Last name is required"
    },
    {
      type: "input",
      name: "email",
      message: "Email Address:",
      validate: (input: string) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(input) ? true : "Please enter a valid email address";
      }
    },
    {
      type: "input",
      name: "address",
      message: "Street Address:",
      validate: (input: string) => input.trim() ? true : "Address is required"
    },
    {
      type: "input",
      name: "city",
      message: "City:",
      validate: (input: string) => input.trim() ? true : "City is required"
    },
    {
      type: "input",
      name: "state",
      message: "State (2-letter code):",
      validate: (input: string) => {
        const stateRegex = /^[A-Z]{2}$/;
        return stateRegex.test(input.toUpperCase()) ? true : "Please enter a valid 2-letter state code";
      },
      filter: (input: string) => input.toUpperCase()
    },
    {
      type: "input",
      name: "zip",
      message: "ZIP Code:",
      validate: (input: string) => {
        const zipRegex = /^\d{5}(-\d{4})?$/;
        return zipRegex.test(input) ? true : "Please enter a valid ZIP code";
      }
    },
    {
      type: "input",
      name: "phone",
      message: "Phone Number:",
      validate: (input: string) => {
        const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
        return phoneRegex.test(input.replace(/[\s\-\(\)]/g, "")) ? true : "Please enter a valid phone number";
      }
    },
    {
      type: "input",
      name: "dateOfBirth",
      message: "Date of Birth (YYYY-MM-DD):",
      validate: (input: string) => {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(input)) return "Please enter date in YYYY-MM-DD format";
        
        const date = new Date(input);
        const today = new Date();
        if (date > today) return "Date of birth cannot be in the future";
        if (date < new Date("1900-01-01")) return "Please enter a valid date of birth";
        
        return true;
      }
    },
    {
      type: "input",
      name: "additionalNotes",
      message: "Additional Notes (optional):",
      default: ""
    }
  ];

  const answers = await inquirer.prompt(questions);
  
  try {
    const user = UserSchema.parse(answers);
    console.log(chalk.green("\n✅ User information collected successfully!"));
    return user;
  } catch (error) {
    console.error(chalk.red("❌ Invalid user data:"), error);
    process.exit(1);
  }
}

export async function confirmRemoval(user: User, brokerCount: number): Promise<boolean> {
  console.log(chalk.yellow("\n📋 Summary:"));
  console.log(chalk.gray(`Name: ${user.firstName} ${user.lastName}`));
  console.log(chalk.gray(`Email: ${user.email}`));
  console.log(chalk.gray(`Address: ${user.address}, ${user.city}, ${user.state} ${user.zip}`));
  console.log(chalk.gray(`Phone: ${user.phone}`));
  console.log(chalk.gray(`Date of Birth: ${user.dateOfBirth}`));
  console.log(chalk.blue(`\nBrokers to process: ${brokerCount}`));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Proceed with data removal?",
      default: false
    }
  ]);

  return confirm;
}

export async function selectSingleBroker(brokers: Broker[]): Promise<Broker | null> {
  console.log(chalk.blue.bold("🔍 Single Broker Testing Mode"));
  console.log(chalk.gray("Select a broker to test individually:\n"));

  const choices = [
    {
      name: "Run all brokers",
      value: "all"
    },
    ...brokers.map((broker, index) => ({
      name: `${broker.name} - ${broker.opt_out_url}`,
      value: broker
    }))
  ];

  const { selectedBroker } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedBroker",
      message: "Select broker to test:",
      choices
    }
  ]);

  return selectedBroker === "all" ? null : selectedBroker;
}

export function saveUserData(user: User): void {
  try {
    writeFileSync("user.json", JSON.stringify(user, null, 2));
    console.log(chalk.green("💾 User data saved to user.json"));
  } catch (error) {
    console.error(chalk.red("❌ Failed to save user data:"), error);
  }
}

export function loadUserData(): User | null {
  try {
    const data = readFileSync("user.json", "utf-8");
    const user = UserSchema.parse(JSON.parse(data));
    return user;
  } catch (error) {
    return null;
  }
} 
