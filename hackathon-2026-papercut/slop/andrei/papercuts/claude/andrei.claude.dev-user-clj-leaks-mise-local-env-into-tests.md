---
title: `dev/src/user.clj` merges the developer's `mise.local.toml` `[env]` block into `environ` in every JVM with the `:dev` alias, including `./bin/test-agent` runs, so locally set `MB_LLM_*` vars make metabot settings tests fail on the laptop but not in CI, and review agents diagnose the failures as a broken test fixture.
slug: dev-user-clj-leaks-mise-local-env-into-tests
kind: test-harness
impact: wasted-time
severity: medium
status: documented-still-hit # a local note covered it
area: dev/src/user.clj (load-mise-local!), mise.local.toml, bin/test-agent (:dev alias), metabase.metabot.settings-test (do-with-selected-model!)
merged_from: dev-user-clj-loads-mise-local-env-into-tests, dev-user-clj-merges-mise-local-env-into-tests
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/21ad940c-c551-4b95-84ed-c73a3ac86c8a.jsonl
    lines: 182-1919
    date: 2026-08-24
    jev: {any_papercut: 0.84, env_toolchain: 0.83, stale_state: 0.29, verify_mismatch: 0.57, misleading_code: 0.38, hidden_coupling: 0.73, stale_docs: 0.33, tool_footgun: 0.55, flaky: 0.58, agent_bug: 0.93, wasted_effort: 0.57, user_correction: 0.13}
---
## Summary
An audit of a metabot PR reported that the `do-with-selected-model!` test fixture was broken, because `metabase.metabot.settings-test` failed 4 tests locally. The agent found the real cause: `dev/src/user.clj` loads `mise.local.toml` into `environ` at JVM boot, the file sets `MB_LLM_METABOT_PROVIDER` and a provider API key, the env-backed provider outranks stored settings and the key creates a read-only env connection. With the file moved aside the suite was green. A later audit round in the same session reported the same 4 failures with a different invented mechanism, and the agent had to refute it again with a controlled pair of runs.

## Symptom
- Round 1 (morning): 4 local failures in `metabase.metabot.settings-test`; the audit prescribed rewriting `do-with-selected-model!`.
- L255: with `mise.local.toml` moved aside: `91 assertions, 0 failures, 0 errors`.
- Round 3 (afternoon, L1805): the combined review repeats the finding with a new story (`restore-cache!` wiping enclosing bindings).
- L1896: scrubbed run 35 tests / 0 failures and 159 self-suite tests / 0 failures; with the file present, exactly the review's 4 failures.

## Timeline
- L28 (08:50): handoff lists the audit finding against the fixture.
- L182-195: the agent finds `MB_LLM_METABOT_PROVIDER` and a provider API key in `metabase/mise.local.toml`.
- L233-239: finds `(load-mise-local!)` at the end of `dev/src/user.clj`.
- L248-260 (08:55): scrubbed run is green; finding rejected.
- L1805 (16:52): the next combined review repeats the finding.
- L1860-1896 (16:54-16:58): controlled scrubbed/contaminated pair; L1919: the agent records this as the third appearance of the same false positive.
- Cost: two refutation passes of about 5 minutes each, and three review rounds carrying a false finding.

## Root cause
On master, `dev/src/user.clj` ends with `(load-mise-local!)`, which reads `[env]` from `mise.local.toml` in the working directory and `alter-var-root`s it into `environ.core/env`. `bin/test-agent` runs with `:dev:dev/test:ee:ee-dev:test`, so user.clj loads in the test JVM. Env-var-backed settings outrank DB values, so the test fixtures cannot mask them. CI has no `mise.local.toml`.

## Why agents fall for it
The failures are deterministic on the laptop, sit in the settings code the PR touched, and nothing in the output mentions mise.local.toml. Reviewers are separate agents without that context, so each round invents a mechanism in the fixture.

## Current state
Checked origin/master: `dev/src/user.clj` still calls `(load-mise-local!)` at load (since 2026-04-30); `bin/test-agent` aliases still include `:dev`.

## Suggested fix
- Skip `load-mise-local!` when `mb.run.mode` is `test`, or move it into `dev/start!`.
- Log one line naming the `MB_*` keys it merged, so contaminated runs are visible.
- Have test-agent export a flag that disables the merge, or scrub `MB_LLM_*` from environ in the metabot test fixtures.

## Detection signal
Local-only failures in `metabase.metabot.settings-test` or LLM provider tests that disappear with `mise.local.toml` moved aside; review findings about env-binding fixtures; `MB_LLM_` keys in `mise.local.toml`.

## Raw excerpts
```
L234 [RESULT] dev/src/user.clj:71:(defn- load-mise-local! dev/src/user.clj:72:  "Parse mise.local.toml and merge its [env] val [...]
L255 [RESULT] RC=0 [...] 91 assertions, 0 failures, 0 errors.
L1860 [CALL] Bash: { echo "=== SCRUBBED settings-test (finding 1 check) ==="; mv mise.local.toml mise.local.toml.aside; ./bin/test-agent :only '[metabase.metabot.settings-test]' 2>&1 | tail -5; [...] mv -f mise.local.toml.aside mise.local.toml; [...]
L1896 [RESULT] === SCRUBBED settings-test (finding 1 check) === {:test 35, :pass 91, :fail 0, :error 0, [...]} [...] === WITH mise.local.toml present (contaminated control) === [...] 91 assertions, 4 failures, 0 errors.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/c9e08d36-c34d-4cc5-8d80-81c8c80b1f99/subagents/agent-af47c805bee7d5607.jsonl
  lines: 112-158
  date: 2026-09-11
  jev: {any_papercut: 0.81, env_toolchain: 0.94, stale_state: 0.22, verify_mismatch: 0.79, misleading_code: 0.15, hidden_coupling: 0.35, stale_docs: 0.23, tool_footgun: 0.39, flaky: 0.43, agent_bug: 0.16, wasted_effort: 0.48, user_correction: 0.08}

L118: `ERROR in metabase.slackbot.uploads-test during :clojure.test/once-fixtures (encryption.clj:390)` / `Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains`; L133: same error with the variable unset; L153: the agent cannot scrub the leak without editing files outside its scope.

- L112-L118: combined test run, uploads-test errors in its once-fixture.
- L122-L123: variable absent from the shell env, present in `mise env`; the changed namespace passes alone.
- L132-L133: `mise exec -- env -u MB_ENCRYPTION_SECRET_KEY …` fails identically.
- L144-L153: finds `load-mise-local!` in user.clj; cannot fix it within its scope.
- L158: pushes with the caveat.
- Main session L1388-L1395, L1498, L1546, L1564, L1604: `mv mise.local.toml …bak`, run, `mv` back, each time uploads-test is needed.
- Cost: about 8 investigation calls, a push with an unverified suite, and a fragile move-aside ritual for the rest of the session.

```
L118 [RESULT] 12:ERROR in metabase.slackbot.uploads-test during :clojure.test/once-fixtures (encryption.clj:390) ⏎ 15:clojure.lang.ExceptionInfo: Database was encrypted with a different key than the MB_ENCRYPTION_SECRET_KEY environment contains ⏎ 97:16 assertions, 0 failures, 1 error.
L123 [RESULT] === MB_ENCRYPTION_SECRET_KEY in shell env? === ⏎ 0 ⏎ === mise env exposes it? === ⏎ export MB_ENCRYPTION_SECRET_KEY=[REDACTED] ⏎ === client-test alone === ⏎ … 15 assertions, 0 failures, 0 errors.
L132 [CALL Bash] cd ~/src/mb/metabase && mise exec -- env -u MB_ENCRYPTION_SECRET_KEY ./bin/test-agent :only '[metabase.slackbot.client-test metabase.slackbot.uploads-test]' 2>&1 | grep -E "…" | tail -8
L133 [RESULT] ERROR in metabase.slackbot.uploads-test during :clojure.test/once-fixtures (encryption.clj:390) ⏎ … 16 assertions, 0 failures, 1 error.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6/subagents/agent-ac3e6b2d811e099e8.jsonl
  lines: 173-224
  date: 2026-09-04
  jev: {any_papercut: 0.92, env_toolchain: 0.95, stale_state: 0.57, verify_mismatch: 0.82, misleading_code: 0.36, hidden_coupling: 0.68, stale_docs: 0.25, tool_footgun: 0.89, flaky: 0.54, agent_bug: 0.52, wasted_effort: 0.80, user_correction: 0.06}

- L177: `ERROR in metabase-enterprise.serialization.v2.load-test/dashboard-card-test (encryption.clj:243)` with the MB_ENCRYPTION_SECRET_KEY message.
- L185: `MB_DB_FILE=<local app DB file>` in the env the tests inherit.
- L206: after `env -u`, the same errors.

- L161: the agent already expects local failures from `MB_LLM_*` env leakage from mise.local.toml.
- L155-L169: serialization batch: 111 tests, 2 failures, 52 errors.
- L173-L185: inspects encryption.clj and the mise env; confirms tests use an in-memory DB.
- L186-L187: reruns with `mise exec -- env -u MB_ENCRYPTION_SECRET_KEY clojure ...` in the background.
- L206-L211: the no-key rerun still gives the same 52 errors; stashes the change to show they pre-exist.
- L224: the final report says unsetting the key did not clear the errors and leaves them unexplained.
- Cost: two extra test runs (about 1.5 min each) and 52 errors left unexplained in a verification run.

```
L169 [RESULT] ... ===== serialization run ===== ... Ran 111 tests in 43.402 seconds | 3157 assertions, 2 failures, 52 errors.
L177 [RESULT] ===== serialization error detail (first occurrence) ===== | 4551:ERROR in metabase-enterprise.serialization.v2.load-test/dashboard-card-test (encryption.clj:243) | ... | clojure.lang.ExceptionInfo: MB_ENCRYPTION_SECRET_KEY is set but the database is not marked as encrypted and already contains data the key does not decrypt. ...
L185 [RESULT] --- MB_DB_FILE value --- | MB_DB_FILE=<local app DB file> ...
L186 [CALL] Bash: cd ~/src/mb/metabase && ... mise exec -- env -u MB_ENCRYPTION_SECRET_KEY clojure -X:dev:ee:ee-dev:test :only '[metabase-enterprise.serialization.api-test ...]' > <scratchpad>/serialization-t...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/b9969651-5371-431a-b6c4-6d9916153234.jsonl
  lines: 1406-1497
  date: 2026-08-24
  jev: {any_papercut: 0.92, env_toolchain: 0.91, stale_state: 0.57, verify_mismatch: 0.94, misleading_code: 0.30, hidden_coupling: 0.77, stale_docs: 0.25, tool_footgun: 0.80, flaky: 0.90, agent_bug: 0.97, wasted_effort: 0.65, user_correction: 0.62}

- L1440: `FAIL in (list-models-explicit-credentials-test) (claude_test.clj:738)` plus four `settings_test.clj` failures.
- L1446: `:RESULT {:test 77, :pass 252, :fail 5, :error 0, :type :summary}`.
- L1451 and L1497: the agent attributes all five to `MB_LLM_METABOT_PROVIDER` reaching environ through `dev/src/user.clj`.

- L1406-1408 (21:20): run in the main checkout, which has `mise.local.toml`.
- L1439-1446: 5 failures.
- L1451: dismissed as the known leak; lint gates and push follow.
- Cost: no rework this time, but a verification run that cannot distinguish the leak from a regression in the same tests.

```
L1406 [CALL] Bash: cd ~/src/mb/metabase && timeout 900 mise exec -- clojure -M:dev:ee:ee-dev -e " (require '[clojure.test :as t] 'metabase.metabot.self.claude-test 'metabase.metabot.settings-test) (println :RESULT (t/run-tests 'metabase.metabot.self.claude-test 'metabase.metabot.settings-test))" > [...]/fastmode.txt 2>&1; [...]
L1440 [RESULT] FAIL in (list-models-explicit-credentials-test) (claude_test.clj:738)
FAIL in (metabot-provider-keeps-slashes-in-a-vllm-model-test) (settings_test.clj:252)
FAIL in (validate-metabot-provider-defers-the-unknown-connection-error-test) (settings_test.clj:269)
FAIL in (metabot-configured-with-direct-connection-no-api-key-test) (settings_test.clj:136)
FAIL in (metabot-configured-proxy-url-not-fallback-for-direct-connection-test) (settings_test.clj:150)
L1446 [RESULT] [...] :RESULT {:test 77, :pass 252, :fail 5, :error 0, :type :summary}
```
