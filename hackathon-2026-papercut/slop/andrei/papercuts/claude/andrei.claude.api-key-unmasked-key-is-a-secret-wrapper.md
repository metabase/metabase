---
title: `create-api-key-with-new-user!` returns `:unmasked_key` as a `metabase.util.secret` wrapper, so an agent scripting over nREPL writes `<< REDACTED SECRET >>` into its .env and only finds out when zsh fails to source it
slug: api-key-unmasked-key-is-a-secret-wrapper
kind: codebase-trap
impact: wasted-time
severity: low
status: open
area: src/metabase/api_keys/models/api_key.clj (create-api-key-with-new-user!), src/metabase/util/secret.clj (Secret toString), nREPL dev scripting
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7ee5589e-88e5-463a-a3d6-e429eb321d74.jsonl
    lines: 2552-2581
    date: 2026-09-23
    jev: {any_papercut: 0.86, env_toolchain: 0.95, stale_state: 0.50, verify_mismatch: 0.14, misleading_code: 0.34, hidden_coupling: 0.63, stale_docs: 0.27, tool_footgun: 0.85, flaky: 0.62, agent_bug: 0.86, wasted_effort: 0.63, user_correction: 0.22}
---
## Summary
To mint a local admin API key for demo scripts, the agent called the model function over nREPL and wrote `(str "MB_API_KEY=" (:unmasked_key k))` to a .env file. `:unmasked_key` holds a `Secret`, whose `toString` is `<< REDACTED SECRET >>`, so the file got that placeholder. Sourcing it in zsh failed with `parse error near \n` (the `<<` starts a heredoc) and the follow-up curls got JSON decode errors. The agent inspected the bytes, deleted the key, and recreated it with `u.secret/expose`.

## Symptom
- L2553: `~/src/mb/papercuts/.env:3: parse error near `\n'` followed by Python JSON decode errors from the auth check.
- L2568: `awk` reports the value has length 21 and starts with `<< R`, the redaction placeholder.

## Timeline
- L2552: key created, value written with `(:unmasked_key k)`.
- L2553: sourcing the .env fails; auth probes fail.
- L2563-L2568: byte inspection (after `cat -A` fails on BSD cat) finds the placeholder.
- L2573-L2581: key deleted and recreated with `(u.secret/expose (:unmasked_key k))`; auth verified.
- Cost: 5 tool calls and one throwaway API key.

## Root cause
The model function assocs `:unmasked_key` with the unexposed `Secret`; the REST layer (src/metabase/api_keys/api.clj) and the SCIM endpoint call `u.secret/expose` before responding, so only direct callers see the wrapper. The key name promises plaintext.

## Why agents fall for it
The name says "unmasked"; `str` on the wrapper does not throw; the placeholder only surfaces downstream, in a different tool.

## Current state
Checked origin/master: api_key.clj still does `(assoc :unmasked_key unhashed-key)` with a `Secret`, and metabase.util.secret's `toString` returns `<< REDACTED SECRET >>`; api_keys/api.clj exposes it before returning.

## Suggested fix
- Rename the model-level key (for example `:unmasked-key-secret`) or return the exposed string from the model and keep the wrapper internal.
- Say in the docstring that the value is a `Secret` and must go through `u.secret/expose`.

## Detection signal
`<< REDACTED SECRET >>` appearing in generated files, headers or env; zsh "parse error near `\n'" when sourcing a generated .env.

## Raw excerpts
```
L2552 [CALL] Bash: ~/src/mb/papercuts/bin/nrepl-eval '(do ... (let [admin ... k (binding [api/*current-user-id* admin] (api-key/create-api-key-with-new-user! {:key-name "papercuts-demo" :group-id (:id (perms/admin-group))}))] (spit (str (System/getProperty "user.home") "/src/mb/papercuts/.env") (str "MB_API_KEY=" (:unmasked_key k) "\nMB_URL=http://localhost:3000\n")) ...'
L2553 [RESULT (ERROR)] Exit code 1 | {:admin 1, :key-id 1} | ~/src/mb/papercuts/.env:3: parse error near `\n' | Traceback (most recent call last): ... json.decoder.JSONDecodeError: Expecting value: line 1 column 1 (char 0)
L2567 [CALL] Bash: sed -E 's/^(MB_API_KEY=[REDACTED:secret_assignment]' ~/src/mb/papercuts/.env | od -c | head -8; awk -F= '/MB_API_KEY/{print length($2), substr($2,1,4)}' ~/src/mb/papercuts/.env
L2568 [RESULT] 0000000 M B _ A P I _ K E Y = < m a s k | 0000020 e d > \n M B _ U R L = h t t p : | ... | 21 << R
L2574 [CALL] Bash: ~/src/mb/papercuts/bin/nrepl-eval '(do ... (t2/delete! :model/ApiKey :name "papercuts-demo") (let [k ...] (spit ... (str "MB_API_KEY=" (u.secret/expose (:unmasked_key k)) "\nMB_URL=http://localhost:3000\n")) (:id k)))' && set -a && . ~/src/mb/papercuts/.env && ...
L2581 [RESULT] 2 | user 4 superuser True | [...]
```
