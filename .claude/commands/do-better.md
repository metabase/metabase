# Do-Better Command

## Instructions

1. Check the value of `$ARGUMENTS`.
2. If `$ARGUMENTS` is empty or not one of: "on", "off", or "reflect", respond with:
   ```
   Usage: /project:do-better [argument]
   
   Supported arguments:
   - on: Activate feedback logging
   - off: Deactivate feedback logging
   - reflect: Generate insights from existing logs
   ```
3. Otherwise, proceed with the appropriate action based on the argument.

## Actions

### When argument is "on"

1. Create directory `.claude/do-better` if it doesn't exist.
2. Create a new log file at `.claude/do-better/prompt-log-<timestamp>.md` (replace "<timestamp>" with current ISO timestamp).
3. Begin monitoring and logging the following conditions:
   - Analysis taking longer than 60 seconds
   - Token usage exceeding 50,000 tokens
   - Errors encountered during analysis
   - User feedback indicating incorrect responses

### When argument is "off"

1. Stop monitoring and logging conditions.
2. Add a closing entry to the current log file.

### When argument is "reflect"

1. Analyze all log files in `.claude/do-better/`.
2. Generate insights about patterns in performance issues.
3. Provide recommendations for improvement.

## Log Format

Each entry in the log file must follow this format:

```markdown
### New Entry
timestamp: <ISO timestamp>
reason: <reason code>
user prompt:
  - <bullet point summary of the user's prompt>
agent reflection:
  - <bullet point summary of why this behavior occurred>
agent learnings:
  - <bullet point learnings for the future>
```

## Reason Codes

- `LONG_RESPONSE_TIME: Xs` (X = response time in seconds)
- `TOKEN_COUNT: Y` (Y = token count)
- `USER_FEEDBACK`
- `ERROR`

## Entry Components

### User Prompt Summary
Provide a bullet-point summary of the user's request that triggered the log entry.

### Agent Reflection
Provide a bullet-point analysis explaining:
- For high token counts: Which aspects of the analysis required significant tokens
- For long response times: Which parts of the analysis took longest
- For errors: What was attempted that resulted in the error
- For user feedback: What was incorrect about the previous response

### Agent Learnings
Provide bullet points on how to improve future interactions:
- More efficient approaches
- Additional information needed from users
- Successful recovery strategies
- Patterns that could lead to better responses