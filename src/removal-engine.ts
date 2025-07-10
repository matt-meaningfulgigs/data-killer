import { Stagehand } from "@browserbasehq/stagehand";
import { User, Broker, RemovalResult } from "./types.js";
import chalk from "chalk";
import ora from "ora";
import { z } from "zod";
import { mkdirSync, existsSync } from "fs";
import { AIAnalyzer } from "./ai-analyzer.js";

export class RemovalEngine {
  private stagehand: Stagehand | null = null;
  private aiAnalyzer: AIAnalyzer;

  constructor() {
    this.aiAnalyzer = new AIAnalyzer();
  }

  async initialize(): Promise<void> {
    try {
      this.stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: process.env.BROWSERBASE_API_KEY,
        projectId: process.env.BROWSERBASE_PROJECT_ID,
        modelName: "openai/gpt-4o-mini",
        modelClientOptions: {
          apiKey: process.env.OPENAI_API_KEY,
        },
        // Add stealth mode configuration to avoid bot detection
        localBrowserLaunchOptions: {
          args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-first-run",
            "--no-zygote",
            "--disable-gpu",
            "--disable-background-timer-throttling",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-features=TranslateUI",
            "--disable-ipc-flooding-protection",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-plugins",
            "--disable-sync",
            "--disable-translate",
            "--hide-scrollbars",
            "--mute-audio",
            "--no-default-browser-check",
            "--no-pings",
            "--no-zygote",
            "--safebrowsing-disable-auto-update",
            "--disable-client-side-phishing-detection",
            "--disable-component-update",
            "--disable-domain-reliability",
            "--disable-features=AudioServiceOutOfProcess",
            "--disable-hang-monitor",
            "--disable-prompt-on-repost",
            "--disable-web-security",
            "--disable-features=VizDisplayCompositor",
          ],
          extraHTTPHeaders: {
            "Accept-Language": "en-US,en;q=0.9",
            "Accept-Encoding": "gzip, deflate, br",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Sec-Ch-Ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"macOS"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
          },
          viewport: {
            width: 1920,
            height: 1080,
          },
          deviceScaleFactor: 1,
          hasTouch: false,
          locale: "en-US",
          timezoneId: "America/Los_Angeles",
          permissions: ["geolocation"],
        },
      });
      await this.stagehand.init();
      console.log(chalk.green("✅ Stagehand initialized successfully"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to initialize Stagehand:"), error);
      throw error;
    }
  }

  async removeFromBroker(broker: Broker, user: User): Promise<RemovalResult> {
    if (!this.stagehand) {
      throw new Error("Stagehand not initialized");
    }

    // Ensure screenshots directory exists
    if (!existsSync("screenshots")) {
      mkdirSync("screenshots");
    }

    const spinner = ora(`Processing ${broker.name}...`).start();
    const result: RemovalResult = {
      broker,
      success: false,
      timestamp: new Date(),
    };
    let screenshotPath = "";

    try {
      const page = this.stagehand.page;
      
      // Navigate to the broker's opt-out URL
      spinner.text = `Navigating to ${broker.name}...`;
      await page.goto(broker.opt_out_url);
      
      // Wait for page to load
      await page.waitForLoadState("networkidle");
      
      // Check if this site requires a search-first approach
      const needsSearch = await this.checkIfNeedsSearch(page, broker);
      
      if (needsSearch) {
        spinner.text = `Searching for ${user.firstName} ${user.lastName} on ${broker.name}...`;
        await this.performSearch(page, user);
        
        // Wait for search results
        await page.waitForLoadState("networkidle");
        
        spinner.text = `Looking for listing on ${broker.name}...`;
        const listingFound = await this.findAndClickListing(page, user);
        
        if (!listingFound) {
          spinner.fail(`❌ Could not find listing for ${user.firstName} ${user.lastName} on ${broker.name}`);
          result.error = "Could not find user listing";
          return result;
        }
        
        // Wait for listing page to load
        await page.waitForLoadState("networkidle");
      }
      
      // Apply broker-specific instructions if available
      if (broker.notes && (broker.notes.includes("AI Analysis") || broker.notes.includes("Enter your email") || broker.notes.includes("Click the"))) {
        spinner.text = `Applying specific instructions for ${broker.name}...`;
        await this.applySpecialInstructions(page, broker);
      }
      
      // Use generic form filling approach
      spinner.text = `Filling removal form for ${broker.name}...`;
      await this.fillRemovalForm(page, user);
      
      // Submit the form
      spinner.text = `Submitting removal request for ${broker.name}...`;
      await this.submitRemovalForm(page);
      
      // Verify submission
      spinner.text = `Verifying submission for ${broker.name}...`;
      const verification = await this.verifySubmission(page);
      
      result.success = verification.success;
      result.details = verification.message;

      // Take screenshot after attempt
      screenshotPath = `screenshots/${result.success ? "success" : "failure"}-${broker.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
      try {
        const screenshotBuffer = await page.screenshot({ fullPage: true });
        const fs = await import('fs');
        fs.writeFileSync(screenshotPath, screenshotBuffer);
        console.log(chalk.gray(`📸 Screenshot saved: ${screenshotPath}`));
        (result as any).screenshot = screenshotPath;
      } catch (screenshotError) {
        console.error(chalk.red(`❌ Failed to save screenshot: ${screenshotError}`));
        (result as any).screenshot = "failed_to_save";
      }
      
      if (result.success) {
        spinner.succeed(`✅ Successfully removed from ${broker.name}`);
      } else {
        spinner.fail(`❌ Failed to remove from ${broker.name}: ${verification.message}`);
        
        // Analyze failure with AI if screenshot was saved
        if ((result as any).screenshot && (result as any).screenshot !== "failed_to_save") {
          try {
            console.log(chalk.blue(`🤖 Starting AI analysis of failure...`));
            const analysis = await this.aiAnalyzer.analyzeFailureScreenshot(
              (result as any).screenshot,
              broker,
              result.error || result.details || "Unknown error"
            );
            
            // Update broker with learned fixes
            const updatedBroker = this.aiAnalyzer.updateBrokerWithAnalysis(broker, analysis);
            
            // Store analysis in result
            (result as any).aiAnalysis = analysis;
            
          } catch (analysisError) {
            console.error(chalk.red(`❌ AI analysis failed: ${analysisError}`));
          }
        }
      }
      
    } catch (error) {
      spinner.fail(`❌ Error processing ${broker.name}`);
      result.error = error instanceof Error ? error.message : String(error);
      console.error(chalk.red(`Error details for ${broker.name}:`), error);
      // Take failure screenshot on error
      if (this.stagehand && this.stagehand.page) {
        screenshotPath = `screenshots/failure-${broker.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`;
        try {
          const screenshotBuffer = await this.stagehand.page.screenshot({ fullPage: true });
          const fs = await import('fs');
          fs.writeFileSync(screenshotPath, screenshotBuffer);
          console.log(chalk.gray(`📸 Error screenshot saved: ${screenshotPath}`));
          (result as any).screenshot = screenshotPath;
        } catch (screenshotError) {
          console.error(chalk.red(`❌ Failed to save error screenshot: ${screenshotError}`));
          (result as any).screenshot = "failed_to_save";
        }
      }
    }

    return result;
  }

  private async checkIfNeedsSearch(page: any, broker: Broker): Promise<boolean> {
    // Check if the page has a search form or if we're on a search page
    const searchCheck = await page.extract({
      instruction: "Check if this page has a search form or if we need to search for someone first before removing them",
      schema: z.object({
        hasSearchForm: z.boolean().describe("Whether there's a search form on the page"),
        hasRemovalForm: z.boolean().describe("Whether there's a removal/opt-out form on the page"),
        pageType: z.string().describe("Type of page (search, removal form, etc)"),
        needsSearchFirst: z.boolean().describe("Whether we need to search for someone before removing them"),
      }),
    });

    // Specific brokers that we know need search-first approach
    const searchFirstBrokers = [
      "Whitepages", "Spokeo", "BeenVerified", "Intelius", "TruthFinder", 
      "MyLife", "Radaris", "US Search", "411.com", "411 Locate"
    ];

    return searchCheck.needsSearchFirst || searchFirstBrokers.includes(broker.name);
  }

  private async performSearch(page: any, user: User): Promise<void> {
    // Use AI to find and fill the search form
    const searchInstructions = `
      Find and fill out the search form with the following information:
      - First Name: ${user.firstName}
      - Last Name: ${user.lastName}
      - Address: ${user.address}, ${user.city}, ${user.state} ${user.zip}
      - Phone: ${user.phone}
      
      Look for search fields and fill them appropriately. Then click the search button.
    `;

    await page.act(searchInstructions);
  }

  private async findAndClickListing(page: any, user: User): Promise<boolean> {
    // Look for the user's listing in search results
    const listingCheck = await page.extract({
      instruction: `Look for a listing that matches:
      - Name: ${user.firstName} ${user.lastName}
      - Address: ${user.address}, ${user.city}, ${user.state} ${user.zip}
      - Phone: ${user.phone}
      
      If you find a matching listing, click on it to view the details.`,
      schema: z.object({
        foundListing: z.boolean().describe("Whether a matching listing was found"),
        listingText: z.string().describe("Text of the found listing"),
        clickedListing: z.boolean().describe("Whether we successfully clicked on the listing"),
      }),
    });

    if (listingCheck.foundListing && listingCheck.clickedListing) {
      return true;
    }

    // If no exact match, try to find the most likely listing
    const fallbackCheck = await page.extract({
      instruction: "If no exact match was found, look for any listing that might be the right person and click on it",
      schema: z.object({
        foundPossibleListing: z.boolean().describe("Whether a possible listing was found"),
        clickedPossibleListing: z.boolean().describe("Whether we clicked on a possible listing"),
      }),
    });

    return fallbackCheck.foundPossibleListing && fallbackCheck.clickedPossibleListing;
  }

  private async fillRemovalForm(page: any, user: User): Promise<void> {
    // Use AI to identify and fill form fields
    const formInstructions = `
      Fill out the data removal form with the following information:
      - First Name: ${user.firstName}
      - Last Name: ${user.lastName}
      - Email: ${user.email}
      - Address: ${user.address}
      - City: ${user.city}
      - State: ${user.state}
      - ZIP: ${user.zip}
      - Phone: ${user.phone}
      - Date of Birth: ${user.dateOfBirth}
      
      Look for form fields that match this information and fill them appropriately.
      If there are multiple forms or sections, fill out all relevant ones.
      Make sure to fill ALL required fields completely.
    `;

    await page.act(formInstructions);
    
    // Wait a moment for fields to populate
    await page.waitForTimeout(1000);
    
    // Verify that all fields were filled
    const fieldCheck = await page.extract({
      instruction: "Check if all form fields have been filled with the user's information",
      schema: z.object({
        allFieldsFilled: z.boolean().describe("Whether all form fields have been filled"),
        missingFields: z.array(z.string()).describe("Any fields that are still empty"),
        filledFields: z.array(z.string()).describe("Fields that have been filled"),
      }),
    });

    if (!fieldCheck.allFieldsFilled) {
      console.log(chalk.yellow(`⚠️  Some fields still empty: ${fieldCheck.missingFields.join(", ")}`));
      // Try to fill missing fields again
      await page.act("Fill any remaining empty fields with the user's information");
      await page.waitForTimeout(1000);
    } else {
      console.log(chalk.gray(`✅ All form fields filled: ${fieldCheck.filledFields.join(", ")}`));
    }
    
    // Handle checkboxes and terms acceptance
    await this.handleCheckboxesAndTerms(page);
  }

  private async handleCheckboxesAndTerms(page: any): Promise<void> {
    // Look for and handle checkboxes, terms acceptance, and consent forms
    const checkboxCheck = await page.extract({
      instruction: `Look for checkboxes that need to be checked, including:
      - Terms of Service acceptance
      - Privacy Policy acceptance
      - Consent to remove data
      - "I agree" checkboxes
      - "I confirm" checkboxes
      - "I understand" checkboxes
      - Any other required checkboxes
      
      Check any checkboxes that are required for form submission.`,
      schema: z.object({
        foundCheckboxes: z.boolean().describe("Whether any checkboxes were found"),
        checkedCheckboxes: z.boolean().describe("Whether checkboxes were successfully checked"),
        checkboxCount: z.number().describe("Number of checkboxes found and checked"),
        checkboxTypes: z.array(z.string()).describe("Types of checkboxes found (terms, privacy, consent, etc)"),
      }),
    });

    if (checkboxCheck.foundCheckboxes && checkboxCheck.checkedCheckboxes) {
      console.log(chalk.gray(`✅ Checked ${checkboxCheck.checkboxCount} checkboxes: ${checkboxCheck.checkboxTypes.join(", ")}`));
    }

    // Also look for radio buttons that might need selection
    const radioCheck = await page.extract({
      instruction: "Look for radio buttons that need to be selected, such as reason for removal or contact preferences",
      schema: z.object({
        foundRadioButtons: z.boolean().describe("Whether any radio buttons were found"),
        selectedRadioButtons: z.boolean().describe("Whether radio buttons were successfully selected"),
        radioButtonCount: z.number().describe("Number of radio buttons found and selected"),
      }),
    });

    if (radioCheck.foundRadioButtons && radioCheck.selectedRadioButtons) {
      console.log(chalk.gray(`✅ Selected ${radioCheck.radioButtonCount} radio buttons`));
    }
  }

  private async applySpecialInstructions(page: any, broker: Broker): Promise<void> {
    // Check if broker has specific instructions in notes
    if (broker.notes && (broker.notes.includes("AI Analysis") || broker.notes.includes("Enter your email") || broker.notes.includes("Click the"))) {
      console.log(chalk.blue(`📋 Applying specific instructions for ${broker.name}...`));
      
      let instructions = "";
      
      // Check for AI-learned instructions
      if (broker.notes.includes("AI Analysis")) {
        const aiMatch = broker.notes.match(/AI Analysis \(\d+\/10\): (.+)/);
        if (aiMatch) {
          instructions = aiMatch[1];
        }
      } else {
        // Use the notes as direct instructions
        instructions = broker.notes;
      }
      
      if (instructions) {
        console.log(chalk.gray(`📝 Instructions: ${instructions}`));
        
        // Apply the specific instructions as actions
        await page.act(`Execute these specific steps exactly: ${instructions}`);
        
        console.log(chalk.gray(`✅ Applied specific instructions for ${broker.name}`));
      }
    }
  }

  private async submitRemovalForm(page: any): Promise<void> {
    // First, try to fill any missing fields that might have been missed
    await page.act("Fill any empty required fields with appropriate information");
    
    // Check if form is ready for submission
    const formCheck = await page.extract({
      instruction: "Check if the form is ready for submission by looking for any missing required fields or unchecked required checkboxes",
      schema: z.object({
        formReady: z.boolean().describe("Whether the form is ready for submission"),
        missingFields: z.array(z.string()).describe("Any missing required fields"),
        uncheckedCheckboxes: z.array(z.string()).describe("Any unchecked required checkboxes"),
        submitButtonText: z.string().describe("Text on the submit button"),
      }),
    });

    if (!formCheck.formReady) {
      console.log(chalk.yellow(`⚠️  Form not ready: Missing ${formCheck.missingFields.join(", ")}`));
      if (formCheck.uncheckedCheckboxes.length > 0) {
        console.log(chalk.yellow(`⚠️  Unchecked checkboxes: ${formCheck.uncheckedCheckboxes.join(", ")}`));
        // Try to check any missing checkboxes
        await page.act("Check any unchecked required checkboxes");
        
        // Wait a moment and check again
        await page.waitForTimeout(1000);
        const recheck = await page.extract({
          instruction: "Check if the form is now ready for submission after checking checkboxes",
          schema: z.object({
            formReady: z.boolean().describe("Whether the form is now ready for submission"),
            stillMissing: z.array(z.string()).describe("Any still missing fields"),
          }),
        });
        
        if (!recheck.formReady) {
          console.log(chalk.red(`❌ Form still not ready after attempting to fix: ${recheck.stillMissing.join(", ")}`));
          return; // Don't submit if form is not ready
        }
      } else {
        console.log(chalk.red(`❌ Form not ready and no checkboxes to fix: ${formCheck.missingFields.join(", ")}`));
        return; // Don't submit if form is not ready
      }
    }

    // Use AI to find and click the submit button
    await page.act("Find and click the submit button, or any button that says 'Submit', 'Send', 'Remove', 'Opt Out', 'Delete', 'Continue', 'Next', or similar");
    
    // Wait for submission to complete
    await page.waitForLoadState("networkidle");
  }

  private async verifySubmission(page: any): Promise<{ success: boolean; message: string }> {
    // Wait a moment for any post-submission content to load
    await page.waitForTimeout(2000);
    
    // First, check for specific error messages we know indicate failure
    const errorCheck = await page.extract({
      instruction: `Look for these specific error indicators that indicate FAILURE:
      - "Missing" followed by field names (like "Missing First Name, Last Name, Email")
      - "Form not ready"
      - "Unchecked checkboxes"
      - "Please fill out all required fields"
      - "Please check the required checkbox"
      - "Invalid" or "Error" messages
      - "Something went wrong"
      - "Please try again"
      
      If you find ANY of these, it's definitely a failure.`,
      schema: z.object({
        foundErrorIndicators: z.boolean().describe("Whether any error indicators were found"),
        errorMessages: z.array(z.string()).describe("List of error messages found"),
        hasMissingFields: z.boolean().describe("Whether there are missing field messages"),
        hasUncheckedCheckboxes: z.boolean().describe("Whether there are unchecked checkbox messages"),
      }),
    });

    if (errorCheck.foundErrorIndicators) {
      return { 
        success: false, 
        message: `Form errors detected: ${errorCheck.errorMessages.join(", ")}` 
      };
    }

    // Now check for success indicators
    const successCheck = await page.extract({
      instruction: `Look for these specific SUCCESS indicators:
      - "Thank you" or "Thanks" messages
      - "Success" or "Successful" 
      - "Confirmation" or "Confirmed"
      - "Your request has been submitted"
      - "We have received your request"
      - "Your information has been removed"
      - "Opt-out successful"
      - "Request processed"
      - "Email confirmation sent"
      - "We'll process your request"
      
      Only if you find these specific success messages should you mark as success.`,
      schema: z.object({
        foundSuccessText: z.boolean().describe("Whether any specific success indicators were found"),
        successText: z.string().describe("The specific success text found"),
        pageTitle: z.string().describe("The page title"),
        mainContent: z.string().describe("Key content from the page"),
      }),
    });

    console.log(chalk.gray(`📄 Page title: ${successCheck.pageTitle}`));
    console.log(chalk.gray(`📝 Main content: ${successCheck.mainContent.substring(0, 200)}...`));

    if (successCheck.foundSuccessText) {
      return { success: true, message: `Success confirmed: ${successCheck.successText}` };
    }

    // Check if we're still on a form page (indicates failure)
    const formCheck = await page.extract({
      instruction: "Check if we're still on a form page with submit buttons or form fields visible",
      schema: z.object({
        stillOnForm: z.boolean().describe("Whether we're still on a form page"),
        hasSubmitButton: z.boolean().describe("Whether there's still a submit button visible"),
        hasFormFields: z.boolean().describe("Whether form fields are still visible"),
        pageType: z.string().describe("Type of page we're on"),
      }),
    });

    if (formCheck.stillOnForm || formCheck.hasSubmitButton || formCheck.hasFormFields) {
      return { 
        success: false, 
        message: `Still on form page - submission failed. Page type: ${formCheck.pageType}` 
      };
    }

    // If we can't determine, default to failure
    return { 
      success: false, 
      message: "Unable to verify success - no clear success indicators found" 
    };
  }



  async close(): Promise<void> {
    if (this.stagehand) {
      try {
        console.log(chalk.gray("🔄 Closing Stagehand session..."));
        await this.stagehand.close();
        console.log(chalk.green("✅ Session closed successfully"));
      } catch (error) {
        console.error(chalk.red("❌ Error closing session:"), error);
      }
    }
  }
} 
