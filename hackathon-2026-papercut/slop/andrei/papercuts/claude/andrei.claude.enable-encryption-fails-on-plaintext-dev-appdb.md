---
title: Adding MB_ENCRYPTION_SECRET_KEY to an existing plaintext dev app DB made the backend exit at startup, and the documented `enable-encryption` command then aborted on a strict setting read, so the agent had to move to a fresh app DB
slug: enable-encryption-fails-on-plaintext-dev-appdb
kind: codebase-trap
impact: wasted-time
severity: medium
status: unknown # startup encryption and the enable-encryption path were reworked on master after 2026-09-03 and the failing "Error decrypting setting" read is gone; not re-run
area: src/metabase/cmd/enable_encryption.clj, app_db/encryption.clj, settings strict decrypt (as of 2026-09-03), local dev-ee startup
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/777aa5d5-083a-4f62-99f6-2f91f01b0a26.jsonl
    lines: 247-378
    date: 2026-09-03
    jev: {any_papercut: 0.86, env_toolchain: 0.94, stale_state: 0.54, verify_mismatch: 0.16, misleading_code: 0.31, hidden_coupling: 0.68, stale_docs: 0.33, tool_footgun: 0.69, flaky: 0.69, agent_bug: 0.56, wasted_effort: 0.64, user_correction: 0.50}
---
## Summary
Local Slackbot testing needs encryption at rest, so the agent appended a fresh MB_ENCRYPTION_SECRET_KEY to mise.local.toml and restarted the dev server (`bun run dev-ee`). The backend refused to start on the existing plaintext DB and exited, which the agent's health poll could not see, so it polled for 10 minutes until the tool timed out. The startup error told it to stop Metabase and run `enable-encryption`; that command failed with "Error decrypting setting \"site-url\": Expected an encrypted value but the stored value is not encrypted". The agent kept the old DB, pointed the dev server at a new app DB file via MB_DB_FILE, and noted a probable bug.

## Symptom
- L255: the dev-server restart reports success, then the JVM exits with code 1 (L271).
- L260: `Command timed out after 10m 0s` on a `/api/health` poll.
- L276: log: "...is set but the database is not marked as encrypted and already contains data the key does not decrypt. If you have just added the key to an existing instance, stop Metabase and run `enable-encryption`".
- L296: `ERROR ENABLING ENCRYPTION: Error decrypting setting "site-url": Expected an encrypted value but the stored value is not encrypted.`

## Timeline
- L247: key appended to mise.local.toml; L253-L255 restart reported as started.
- L259-L263: 10-minute poll times out; the session then sits idle for about 27 minutes.
- L270-L276: log shows the startup refusal.
- L291-L296: DB backed up, `clojure -M:run:ee enable-encryption` fails on the site-url setting.
- L300-L330: reads enable_encryption.clj, encryption.clj and the setting decrypt path.
- L338-L370: comments the key out, then re-enables it with a separate MB_DB_FILE; fresh DB comes up encrypted.
- Cost: about 45 minutes wall clock and a second app DB.

## Root cause
As of the branch base (2026-09-03), startup refused to run when a key was set on a DB with plaintext data, and the only migration path, `enable-encryption`, read settings through the strict decrypt that throws on plaintext before it could encrypt them. This was mid-rework on master (several encryption commits between 2026-08-28 and 2026-09-08). Separately, the dev server was running detached, so a startup exit was only visible in its log.

## Why agents fall for it
The error message prescribes a command, and the command is the documented fix; a health poll that only checks HTTP cannot tell "still booting" from "exited".

## Current state
origin/master: enable_encryption.clj now skips work when `encryption-check-status` is :valid and calls `encrypt-db`; startup encrypts legacy plaintext by default (commits 2026-09-04 and 2026-09-08, the latter adding MB_DISABLE_LEGACY_STARTUP_ENCRYPTION); the string "Error decrypting setting" no longer exists in src/. Not re-run.

## Suggested fix
- Keep a test that runs `enable-encryption` against a DB seeded with plaintext settings.
- When starting the dev server detached, wait for either health 200 or process exit and print the exit reason.
- For local setups, add an encryption key only to a fresh app DB.

## Detection signal
Log lines "is set but the database is not marked as encrypted"; "ERROR ENABLING ENCRYPTION"; a health-poll loop ending in a tool timeout right after a config change.

## Raw excerpts
```
L247 [CALL] Bash: key=$(openssl rand -base64 32) && cat >> mise.local.toml <<EOF | # Encryption at rest, required by slackbot setup-complete? ... | MB_ENCRYPTION_SECRET_KEY = "$key" | EOF ...
L259 [CALL] Bash: for i in $(seq 1 60); do s=$(curl -s -o /dev/null -w '%{http_code}' --max-time 2 localhost:3000/api/health); [ "$s" = "200" ] && echo "up after ${i}0s" && break; sleep 10; done; ...
L260 [RESULT (ERROR)] Exit code 143 | Command timed out after 10m 0s
L271 [RESULT] health: 000 | ... | [backend] clojure -M:run:ee:dev:dev-start --hot exited with code 1
L276 [RESULT] ... ut the database is not marked as encrypted and already contains data the key does not decrypt. If you have just added the key to an existing instance, stop Metabase and run `enable-encryption` to encr...
L295 [CALL] Bash: cd ~/src/mb/metabase && mise exec -- clojure -M:run:ee enable-encryption 2>&1 | tail -15
L296 [RESULT] ... ERROR cmd.core :: ERROR ENABLING ENCRYPTION: Error decrypting setting "site-url": Expected an encrypted value but the stored value is not encrypted.
```
