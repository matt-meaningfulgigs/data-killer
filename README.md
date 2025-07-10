# Data Broker Removal Tool

An automated tool that uses [Stagehand](https://github.com/browserbase/stagehand) to remove personal information from data broker websites.

## Features

- **Real Automation**: Uses AI-powered browser automation to actually submit removal requests
- **Comprehensive Coverage**: Supports 50+ major data brokers
- **User-Friendly CLI**: Interactive command-line interface for data collection
- **Progress Tracking**: Saves progress and provides detailed reports
- **Error Handling**: Robust error handling with detailed logging

## Prerequisites

- Node.js 20+ 
- npm, yarn, or pnpm
- OpenAI API key
- Browserbase API key and project ID

## Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file with your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key
   BROWSERBASE_API_KEY=your_browserbase_api_key
   BROWSERBASE_PROJECT_ID=your_browserbase_project_id
   ```

3. **Data Files**:
   - `brokers.json`: List of data brokers to process
   - `user.json`: User information (will be created by CLI)

## Usage

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

## How It Works

1. **Data Collection**: The CLI collects user information (name, address, phone, etc.)
2. **Broker Processing**: For each data broker:
   - Navigates to the opt-out URL
   - Uses AI to identify and fill form fields
   - Submits the removal request
   - Verifies the submission was successful
3. **Progress Tracking**: Saves results after each broker
4. **Final Report**: Provides detailed success/failure summary

## Supported Data Brokers

The tool supports removal from major data brokers including:
- PeopleFinders
- Spokeo
- BeenVerified
- Whitepages
- Intelius
- TruthFinder
- MyLife
- And many more...

## File Structure

```
├── src/
│   ├── index.ts          # Main application entry point
│   ├── cli.ts            # CLI interface and user data collection
│   ├── removal-engine.ts # Core removal logic using Stagehand
│   ├── ai-analyzer.ts    # AI analysis for failures and page content
│   └── types.ts          # TypeScript type definitions
├── brokers.json          # List of data brokers
├── user.json             # User information (created by CLI)
├── removal-session.json  # Session results (created during execution)
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

## Configuration

### Stagehand Configuration
The tool uses Browserbase for browser automation. Configuration is embedded in the removal engine:

```typescript
const stagehand = new Stagehand({
  env: "BROWSERBASE",
  apiKey: process.env.BROWSERBASE_API_KEY,
  projectId: process.env.BROWSERBASE_PROJECT_ID,
  modelName: "openai/gpt-4o-mini",
  modelClientOptions: {
    apiKey: process.env.OPENAI_API_KEY,
  },
});
```

### Adding New Brokers
To add a new data broker, edit `brokers.json`:

```json
{
  "name": "NewBroker",
  "url": "https://www.newbroker.com",
  "opt_out_url": "https://www.newbroker.com/opt-out",
  "requires_id_upload": false,
  "notes": "Standard opt-out process"
}
```

## Error Handling

The tool includes comprehensive error handling:
- Network timeouts and connection issues
- Form submission failures
- Invalid broker URLs
- API rate limiting
- Browser automation errors

All errors are logged and the process continues with the next broker.

## Security

### Sensitive Files
The following files contain sensitive information and are excluded from version control via `.gitignore`:

- `.env` - Contains API keys and configuration
- `user.json` - Contains personal user information
- `removal-session.json` - Contains session data with personal information
- `screenshots/` - May contain personal information in screenshots
- `node_modules/` - Dependencies (not sensitive but large)
- `dist/` - Build artifacts

### Data Protection
- User data is stored locally in `user.json`
- API keys are loaded from environment variables
- No data is transmitted except to data broker websites
- Session results are saved locally for audit purposes
- Screenshots are saved locally for debugging purposes

### Environment Setup
Create a `.env` file with your API keys:
```
OPENAI_API_KEY=your_openai_api_key
BROWSERBASE_API_KEY=your_browserbase_api_key
BROWSERBASE_PROJECT_ID=your_browserbase_project_id
```

## Troubleshooting

### Common Issues

1. **Stagehand Initialization Failed**
   - Check your API keys in `.env`
   - Verify Browserbase project is active
   - Ensure OpenAI API key is valid

2. **Form Submission Failures**
   - Some brokers may have changed their forms
   - Check the broker's website manually
   - Update the broker configuration if needed

3. **Rate Limiting**
   - The tool includes delays between requests
   - If you encounter rate limits, wait and retry

### Debug Mode

For debugging, you can modify the Stagehand configuration to run locally:

```typescript
const config: StagehandConfig = {
  env: "LOCAL", // Change from "BROWSERBASE" to "LOCAL"
  // ... rest of config
};
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Disclaimer

This tool is for educational and personal use. Users are responsible for:
- Ensuring they have the right to request data removal
- Complying with applicable laws and regulations
- Using the tool responsibly and ethically

The authors are not responsible for any misuse of this tool.
