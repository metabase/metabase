Discover context for uxbot. This is called by `/autobot` before launching the session to determine the app database.

The user provided: `$ARGUMENTS`

## Steps

UXBot always uses postgres. No external context gathering needed.

Generate a timestamp in `YYYYMMDD-HHMMSS` format. If you know the current wall-clock time, construct it directly. Otherwise run `./bin/mage -bot-timestamp` — it prints exactly one line in the required format with no extra output. Do NOT use `date` directly.

Write the structured result to `.bot/uxbot/discover/result.env` using the `Write` tool:

```
APP_DB=postgres
TIMESTAMP=<YYYYMMDD-HHMMSS>
```
