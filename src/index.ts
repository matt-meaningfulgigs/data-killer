import dotenv from "dotenv";
import { RemovalEngine } from "./removal-engine.js";
import { collectUserInfo, confirmRemoval, saveUserData, loadUserData, selectSingleBroker } from "./cli.js";
import { User, Broker, RemovalSession, BrokersArraySchema } from "./types.js";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "fs";

// Load environment variables
dotenv.config();

async function loadBrokers(): Promise<Broker[]> {
  try {
    const data = readFileSync("brokers.json", "utf-8");
    const brokers = BrokersArraySchema.parse(JSON.parse(data));
    console.log(chalk.blue(`📋 Loaded ${brokers.length} data brokers`));
    return brokers;
  } catch (error) {
    console.error(chalk.red("❌ Failed to load brokers:"), error);
    process.exit(1);
  }
}

async function main() {
  console.log(chalk.blue.bold("🔒 Data Broker Removal Tool"));
  console.log(chalk.gray("This tool will help you remove your personal information from data broker websites.\n"));

  // Load brokers
  const brokers = await loadBrokers();

  // Check for existing user data
  let user = loadUserData();
  if (user) {
    console.log(chalk.yellow("Found existing user data. Use existing data? (y/n)"));
    const { useExisting } = await import("inquirer").then(m => m.default.prompt([{
      type: "confirm",
      name: "useExisting",
      message: "Use existing user data?",
      default: true
    }]));
    
    if (!useExisting) {
      user = await collectUserInfo();
      saveUserData(user);
    }
  } else {
    user = await collectUserInfo();
    saveUserData(user);
  }

  // Ask if user wants to test a single broker
  const selectedBroker = await selectSingleBroker(brokers);
  
  // Determine which brokers to process
  const brokersToProcess = selectedBroker ? [selectedBroker] : brokers;
  
  // Confirm removal
  const shouldProceed = await confirmRemoval(user, brokersToProcess.length);
  if (!shouldProceed) {
    console.log(chalk.yellow("Operation cancelled."));
    process.exit(0);
  }

  // Initialize removal engine once for all brokers
  const engine = new RemovalEngine();
  try {
    await engine.initialize();
  } catch (error) {
    console.error(chalk.red("❌ Failed to initialize removal engine:"), error);
    process.exit(1);
  }

  // Create removal session
  const session: RemovalSession = {
    user,
    results: [],
    startTime: new Date(),
  };

  console.log(chalk.blue("\n🚀 Starting removal process..."));
  console.log(chalk.gray("This may take several minutes. Please be patient.\n"));

  // Process each broker
  for (let i = 0; i < brokersToProcess.length; i++) {
    const broker = brokersToProcess[i];
    console.log(chalk.blue(`\n[${i + 1}/${brokersToProcess.length}] Processing ${broker.name}...`));
    
    try {
      const result = await engine.removeFromBroker(broker, user);
      session.results.push(result);
      // Save progress after each broker
      writeFileSync("removal-session.json", JSON.stringify(session, null, 2));
    } catch (error) {
      console.error(chalk.red(`❌ Error processing ${broker.name}:`), error);
      session.results.push({
        broker,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date(),
      });
    }
  }

  // Close engine with proper error handling
  try {
    await engine.close();
  } catch (error) {
    console.error(chalk.red("❌ Error closing engine:"), error);
  }

  // Generate final report
  session.endTime = new Date();
  const successful = session.results.filter(r => r.success).length;
  const failed = session.results.filter(r => !r.success).length;

  console.log(chalk.blue.bold("\n📊 Removal Session Complete"));
  console.log(chalk.gray(`Total brokers processed: ${session.results.length}`));
  console.log(chalk.green(`✅ Successful removals: ${successful}`));
  console.log(chalk.red(`❌ Failed removals: ${failed}`));
  console.log(chalk.gray(`⏱️  Duration: ${Math.round((session.endTime.getTime() - session.startTime.getTime()) / 1000)} seconds`));

  // Save final session
  writeFileSync("removal-session.json", JSON.stringify(session, null, 2));
  console.log(chalk.green("💾 Session results saved to removal-session.json"));

  // Show detailed results
  if (failed > 0) {
    console.log(chalk.yellow("\n❌ Failed removals:"));
    session.results.filter(r => !r.success).forEach(result => {
      console.log(chalk.red(`  • ${result.broker.name}: ${result.error || result.details}`));
    });
  }

  if (successful > 0) {
    console.log(chalk.green("\n✅ Successful removals:"));
    session.results.filter(r => r.success).forEach(result => {
      console.log(chalk.green(`  • ${result.broker.name}`));
    });
  }

  console.log(chalk.blue("\n🎉 Removal process complete!"));
}

// Handle errors
process.on("unhandledRejection", (reason, promise) => {
  console.error(chalk.red("❌ Unhandled Rejection at:"), promise, chalk.red("reason:"), reason);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error(chalk.red("❌ Uncaught Exception:"), error);
  process.exit(1);
});

// Run the application
main().catch(error => {
  console.error(chalk.red("❌ Application error:"), error);
  process.exit(1);
}); 
