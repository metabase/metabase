Discover context for uxbot. This is called by `/autobot` before launching the session to determine the app database.

The user provided: `$ARGUMENTS`

## Steps

UXBot always uses postgres. No external context gathering needed.

Generate a timestamp in `YYYYMMDD-HHMMSS` format. Do NOT use `date` in a Bash command — use the current date/time you already know to construct it directly.

Write the structured result to `.bot/uxbot/discover/result.env` using the `Write` tool:

```
APP_DB=postgres
TIMESTAMP=<YYYYMMDD-HHMMSS>
```
