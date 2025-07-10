import { Broker } from "./types.js";
import chalk from "chalk";
import { readFileSync, writeFileSync } from "fs";
import { z } from "zod";

interface FailureAnalysis {
  problem: string;
  suggestedFix: string;
  nextSteps: string[];
  specialInstructions: string;
  confidence: number;
}

interface PageAnalysis {
  steps: string[];
  pageType: string;
  formFields: string[];
  requiredActions: string[];
  confidence: number;
}

export class AIAnalyzer {
  private openaiApiKey: string;

  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || "";
    if (!this.openaiApiKey) {
      throw new Error("OpenAI API key is required for AI analysis");
    }
  }

  async analyzeFailureScreenshot(
    screenshotPath: string, 
    broker: Broker, 
    error: string
  ): Promise<FailureAnalysis> {
    try {
      console.log(chalk.blue(`🤖 Analyzing failure screenshot for ${broker.name}...`));
      
      // Read the screenshot file
      const screenshotBuffer = readFileSync(screenshotPath);
      const base64Image = screenshotBuffer.toString('base64');

      // Prepare the analysis prompt
      const prompt = `
You are helping someone remove their data from a data broker website, but they're stuck and can't figure out what went wrong. Analyze this screenshot to identify the EXACT steps they're missing.

BROKER: ${broker.name}
URL: ${broker.opt_out_url}
ERROR: ${error}

Focus ONLY on these critical issues:
1. FORM VALIDATION ERRORS: Missing required fields, unchecked checkboxes, invalid input formats
2. MISSING STEPS: Buttons not clicked, forms not submitted, terms not accepted
3. CAPTCHA/BOT DETECTION: Any anti-bot measures that need to be handled
4. MISSING URLS: If they need to provide a specific URL but used a generic one
5. PAGE NAVIGATION: Wrong page, need to search first, need to find listing

DO NOT focus on:
- Minor typos in email addresses
- Cosmetic issues
- General page layout problems

Provide SPECIFIC, ACTIONABLE steps like:
"Click the 'I agree to terms' checkbox before continuing"
"Enter your full address in the address field"
"Click the 'Submit' button after filling all fields"
"Search for your name first, then click on your listing"

What EXACT steps are missing or wrong? Be very specific about what buttons to click, what fields to fill, and what checkboxes to check.
`;

      // Call OpenAI GPT-4o with vision
      const response = await this.callOpenAIWithVision(prompt, base64Image);
      
      // Parse the response
      const analysis = this.parseAnalysisResponse(response);
      
      console.log(chalk.green(`✅ Analysis complete for ${broker.name}`));
      console.log(chalk.gray(`📋 Problem: ${analysis.problem}`));
      console.log(chalk.gray(`🔧 Fix: ${analysis.suggestedFix}`));
      
      return analysis;
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to analyze screenshot: ${error}`));
      return {
        problem: "Analysis failed",
        suggestedFix: "Manual review required",
        nextSteps: ["Check screenshot manually"],
        specialInstructions: "",
        confidence: 0
      };
    }
  }

  private async callOpenAIWithVision(prompt: string, base64Image: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: prompt
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1000,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private parseAnalysisResponse(response: string): FailureAnalysis {
    try {
      // Try to extract structured information from the response
      const lines = response.split('\n');
      let problem = "";
      let suggestedFix = "";
      let nextSteps: string[] = [];
      let specialInstructions = "";
      let confidence = 5;

      for (const line of lines) {
        if (line.toLowerCase().includes('problem:') || line.toLowerCase().includes('issue:')) {
          problem = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('fix:') || line.toLowerCase().includes('solution:')) {
          suggestedFix = line.split(':').slice(1).join(':').trim();
        } else if (line.toLowerCase().includes('steps:') || line.toLowerCase().includes('next:')) {
          const steps = line.split(':').slice(1).join(':').trim();
          nextSteps = steps.split(',').map(s => s.trim()).filter(s => s.length > 0);
        } else if (line.toLowerCase().includes('confidence:')) {
          const conf = parseInt(line.split(':')[1]?.trim() || '5');
          confidence = Math.max(1, Math.min(10, conf));
        }
      }

      // If we couldn't parse structured data, use the whole response
      if (!problem) {
        problem = response.substring(0, 200) + "...";
      }
      if (!suggestedFix) {
        suggestedFix = "Manual review required";
      }

      return {
        problem,
        suggestedFix,
        nextSteps,
        specialInstructions: suggestedFix,
        confidence
      };
    } catch (error) {
      return {
        problem: "Failed to parse analysis",
        suggestedFix: "Manual review required",
        nextSteps: ["Check screenshot manually"],
        specialInstructions: "",
        confidence: 0
      };
    }
  }

  async analyzePageContent(
    brokerName: string,
    pageTitle: string,
    allText: string,
    formFields: string[],
    buttons: string[],
    instructions: string[],
    pageType: string,
    user: any
  ): Promise<PageAnalysis> {
    try {
      console.log(chalk.blue(`🤖 Analyzing page content for ${brokerName}...`));
      
      // Prepare the analysis prompt
      const prompt = `
You are analyzing a data broker removal page to determine the exact steps needed to complete the removal process.

BROKER: ${brokerName}
PAGE TITLE: ${pageTitle}
PAGE TYPE: ${pageType}

USER INFORMATION:
- Name: ${user.firstName} ${user.lastName}
- Email: ${user.email}
- Address: ${user.address}, ${user.city}, ${user.state} ${user.zip}
- Phone: ${user.phone}
- Date of Birth: ${user.dateOfBirth}

PAGE CONTENT:
${allText}

FORM FIELDS FOUND:
${formFields.join('\n')}

BUTTONS FOUND:
${buttons.join('\n')}

INSTRUCTIONS FOUND:
${instructions.join('\n')}

Based on this page content, determine the exact steps needed to complete the data removal process. Be very specific and actionable.

Return your analysis in this exact format:
STEPS:
1. [specific step]
2. [specific step]
3. [specific step]

PAGE_TYPE: [search/form/confirmation/etc]
FORM_FIELDS: [list of fields that need to be filled]
REQUIRED_ACTIONS: [list of required actions like checkboxes, terms acceptance, etc]
CONFIDENCE: [1-10]
`;

      // Call OpenAI
      const response = await this.callOpenAI(prompt);
      
      // Parse the response
      const analysis = this.parsePageAnalysisResponse(response);
      
      console.log(chalk.green(`✅ Page analysis complete for ${brokerName}`));
      console.log(chalk.gray(`📋 Steps: ${analysis.steps.length} steps determined`));
      
      return analysis;
      
    } catch (error) {
      console.error(chalk.red(`❌ Failed to analyze page content: ${error}`));
      return {
        steps: ["Fill form fields", "Check required checkboxes", "Submit form"],
        pageType: "unknown",
        formFields: [],
        requiredActions: [],
        confidence: 0
      };
    }
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.3
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  private parsePageAnalysisResponse(response: string): PageAnalysis {
    try {
      const lines = response.split('\n');
      let steps: string[] = [];
      let pageType = "unknown";
      let formFields: string[] = [];
      let requiredActions: string[] = [];
      let confidence = 5;
      let inSteps = false;

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed.startsWith('STEPS:')) {
          inSteps = true;
          continue;
        } else if (trimmed.startsWith('PAGE_TYPE:')) {
          inSteps = false;
          pageType = trimmed.split(':')[1]?.trim() || "unknown";
        } else if (trimmed.startsWith('FORM_FIELDS:')) {
          const fields = trimmed.split(':')[1]?.trim() || "";
          formFields = fields.split(',').map(f => f.trim()).filter(f => f.length > 0);
        } else if (trimmed.startsWith('REQUIRED_ACTIONS:')) {
          const actions = trimmed.split(':')[1]?.trim() || "";
          requiredActions = actions.split(',').map(a => a.trim()).filter(a => a.length > 0);
        } else if (trimmed.startsWith('CONFIDENCE:')) {
          const conf = parseInt(trimmed.split(':')[1]?.trim() || '5');
          confidence = Math.max(1, Math.min(10, conf));
        } else if (inSteps && trimmed.match(/^\d+\./)) {
          // Extract step content
          const stepContent = trimmed.replace(/^\d+\.\s*/, '');
          if (stepContent.length > 0) {
            steps.push(stepContent);
          }
        }
      }

      return {
        steps,
        pageType,
        formFields,
        requiredActions,
        confidence
      };
    } catch (error) {
      return {
        steps: ["Fill form fields", "Check required checkboxes", "Submit form"],
        pageType: "unknown",
        formFields: [],
        requiredActions: [],
        confidence: 0
      };
    }
  }

  updateBrokerWithAnalysis(broker: Broker, analysis: FailureAnalysis): Broker {
    const updatedBroker = { ...broker };
    
    // Add special instructions if confidence is high enough
    if (analysis.confidence >= 6) {
      updatedBroker.notes = `${broker.notes}\n\nAI Analysis (${analysis.confidence}/10): ${analysis.specialInstructions}`;
      
      // Save updated broker configuration
      this.saveUpdatedBroker(updatedBroker);
      
      console.log(chalk.green(`💾 Updated ${broker.name} with AI analysis`));
    }
    
    return updatedBroker;
  }

  private saveUpdatedBroker(updatedBroker: Broker): void {
    try {
      // Read current brokers file
      const brokersData = readFileSync("brokers.json", "utf-8");
      const brokers = JSON.parse(brokersData);
      
      // Find and update the specific broker
      const brokerIndex = brokers.findIndex((b: Broker) => b.name === updatedBroker.name);
      if (brokerIndex !== -1) {
        brokers[brokerIndex] = updatedBroker;
        
        // Write back to file
        writeFileSync("brokers.json", JSON.stringify(brokers, null, 2));
      }
    } catch (error) {
      console.error(chalk.red(`❌ Failed to save updated broker: ${error}`));
    }
  }
} 
