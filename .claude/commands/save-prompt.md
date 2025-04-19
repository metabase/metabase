# Save Prompt Command

## Instructions

This command saves the most recent user prompt and Claude response to a log file for future reference, including performance diagnostics.

## Process

When this command is invoked, I will:

1. Capture the most recent user prompt exactly as written
2. Capture my most recent response exactly as provided
3. Record available diagnostics (response time, token usage)
4. Add all information to the log file `.claude/logs/save-prompt.log` with a timestamp
5. Confirm the save was completed

## Log Format

Each entry in the log file will follow this format:

```markdown
### Entry <ISO timestamp>

## User Prompt

<exact user prompt text>

## Claude Response

<exact claude response text>

## Diagnostics
- Response time: <time in seconds> seconds
- Token count: <number of tokens used>
- Additional metrics: <any other available performance metrics>

---
```

After logging, I'll provide a brief confirmation that the prompt, response, and diagnostics have been saved.