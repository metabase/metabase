---
title: The per-file Clojure lint command is `./bin/mage kondo <files>`, documented only in skill files, so agents reach for `./bin/kondo.sh` (deleted in 2025) or a bare `clj-kondo` that is not on PATH, and sometimes give up on lint
slug: bare-clj-kondo-lint-misses-repo-hooks
kind: doc-gap
impact: wasted-time
severity: medium
status: open
area: `clj-kondo` (not installed), `mise exec`, `./bin/mage kondo`, metabase `CLAUDE.md`
merged_from: kondo-lint-command-undiscoverable
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/7a10ece8-08be-4759-ac32-93c2b9ea147b.jsonl
    lines: 229-370
    date: 2026-08-24
    jev: {any_papercut: 0.84, env_toolchain: 0.87, stale_state: 0.22, verify_mismatch: 0.25, misleading_code: 0.20, hidden_coupling: 0.40, stale_docs: 0.34, tool_footgun: 0.76, flaky: 0.12, agent_bug: 0.59, wasted_effort: 0.54, user_correction: 0.10}
---
## Summary
Before amending a review-fix commit on a Clojure PR, the agent tried `mise exec -- clj-kondo`, then `which clj-kondo || ls ./bin | head -20`. `mage` sits past the first 20 entries of `bin/`, so the listing showed nothing lint-like, and the agent handed over the commit reporting lint as unverified because no clj-kondo binary was found. The lint gate was skipped, not failed.

## Symptom
- L229-L230: `mise exec -- clj-kondo --lint ...` → `mise ERROR "clj-kondo" couldn't exec process: No such file or directory`.
- L234-L235: `which clj-kondo || ls ./bin | head -20` → `clj-kondo not found`, then 20 `bin/` entries ending before `mage`.
- L370: the final report says lint is unverified because the worktree has no clj-kondo binary.

## Timeline
- L229-L235: two attempts to find a linter.
- L252-L253: tests run instead (175 tests green).
- L370: final report with lint unverified.
- Cost: a commit prepared for push with the lint gate never run.

## Root cause
`bin/kondo.sh` was deleted from metabase in a 2025-08-21 commit, but agents trained on older snapshots still expect it. The replacement, `./bin/mage kondo <files>` (and `kondo-updated <ref>`), is listed in `.claude/skills/_shared/clojure-commands.md`, which is not loaded when the session is rooted outside the metabase checkout; metabase's root `CLAUDE.md` names only `./bin/mage kondo-ratchets`. clj-kondo is not installed as a binary, so `clj-kondo` and `mise exec -- clj-kondo` fail; it runs through mage or `clojure -M:kondo`.

## Why agents fall for it
Every other Clojure project has a `clj-kondo` binary, and older metabase had `bin/kondo.sh`. The working entry point is a babashka task behind `./bin/mage`, whose name says nothing about linting, and `ls bin | head -20` cuts off before `mage`.

## Current state
Checked origin/master: no `bin/kondo.sh` (last touched by its deletion, 2025-08-21). `CLAUDE.md` mentions `./bin/mage kondo-ratchets` only; `./bin/mage kondo <file or files>` and `./bin/mage kondo-updated master` appear in `.claude/skills/_shared/clojure-commands.md`. `.github/workflows/backend.yml` runs `./bin/mage kondo`.

## Suggested fix
- Add one line to metabase `CLAUDE.md`: lint Clojure with `./bin/mage kondo <files>`, or `./bin/mage kondo-updated master` for a branch.
- Restore `bin/kondo.sh` as a shim that execs `./bin/mage kondo "$@"`, so the remembered path still works.
- Agent prompts that ask for a lint pass should name the command instead of 'run clj-kondo'.

## Detection signal
`./bin/kondo.sh: No such file or directory`, `command not found: clj-kondo`, `"clj-kondo" couldn't exec process`, or a final report saying lint was not run or is unverified.

## Raw excerpts
```
L229 [CALL] mise exec -- clj-kondo --lint src/metabase/metabot/agent/user_context.clj src/metabase/metabot/tools/resources.clj ... 2>&1 | tail -20
L230 [RESULT] mise ERROR "clj-kondo" couldn't exec process: No such file or directory | mise ERROR Version: 2026.8.8 macos-arm64 (2026-08-17)
L234 [CALL] which clj-kondo || ls ./bin | head -20
L235 [RESULT] clj-kondo not found | athena.bb | bb | build | build-backend-for-test | build-driver.sh | ... | dev-deps | dev-install | do...
L253 [RESULT] EXIT=0 | Ran 175 tests in 21.332 seconds | 891 assertions, 0 failures, 0 errors.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/31e1a415-680c-4ede-a3d2-fbb1d6e6a89c/subagents/agent-ab7adbcea1498f2c8.jsonl
  lines: 90-101
  date: 2026-08-26
  jev: {any_papercut: 0.70, env_toolchain: 0.88, stale_state: 0.18, verify_mismatch: 0.25, misleading_code: 0.19, hidden_coupling: 0.35, stale_docs: 0.35, tool_footgun: 0.50, flaky: 0.25, agent_bug: 0.09, wasted_effort: 0.31, user_correction: 0.05}

- L91-L92: `./bin/kondo.sh ...` → `(eval):1: no such file or directory: ./bin/kondo.sh`.
- L93-L94: `(command -v clj-kondo || ls bin/ | grep -i kondo) && clj-kondo --lint ...` → exit 1, no output.
- L95-L99: `mise activate --shims`, `.clj-kondo` listing, `deps.edn` grep, `./bin/mage | grep -i kondo`.
- L100-L101: `./bin/mage kondo <files>` → `errors: 0, warnings: 0`.
- Subagent agent-ac949dc44885b8ee9 L66-L87: `./bin/kondo.sh` missing, `zsh: command not found: clj-kondo`, `bb not found`, then `clojure -M:kondo --lint` works.

- agent-ab7adbcea1498f2c8 L90-L101: five calls from the first lint attempt to a clean run.
- agent-ac949dc44885b8ee9 L66-L87: four calls to the same end, via a different command.
- Cost: about 9 tool calls across two subagents working in parallel.

```
L91 [CALL] cd ~/src/mb/wt/<branch> && ./bin/kondo.sh src/metabase/llm/provider.clj src/metabase/llm/settings.clj ...
L92 [RESULT] (eval):1: no such file or directory: ./bin/kondo.sh
L93 [CALL] cd ~/src/mb/wt/<branch> && (command -v clj-kondo || ls bin/ | grep -i kondo) && clj-kondo --lint src/metabase/llm/provider.clj ...
L94 [RESULT (ERROR)] Exit code 1
L95 [CALL] cd ~/src/mb/wt/<branch> && eval "$(mise activate zsh --shims)" 2>/dev/null; command -v clj-kondo; ls .clj-kondo 2>/dev/null | head; grep -rn "kondo" package.json | head -3
L98 [CALL] cd ~/src/mb/wt/<branch> && grep -n "kondo" deps.edn | head -5 && ls bin/mage 2>/dev/null && ./bin/mage 2>&1 | grep -i kondo | head -3
L100 [CALL] cd ~/src/mb/wt/<branch> && eval "$(mise env -s zsh 2>/dev/null)"; ./bin/mage kondo src/metabase/llm/provider.clj ...
L101 [RESULT] Running Kondo on: [...] | linting took 656ms, errors: 0, warnings: 0
L66 [CALL] (subagent ac949) cd ~/src/mb/wt/<branch> && ./bin/kondo.sh src/metabase/metabot/agent/user_context.clj ... || clj-kondo --lint ...
L68 [RESULT] (subagent ac949) (eval):1: no such file or directory: ./bin/kondo.sh
L72 [RESULT] (subagent ac949) zsh: command not found: clj-kondo
L77 [RESULT] (subagent ac949) bb not found | athena.bb | bb | build | ...
L81 [RESULT] (subagent ac949) ... 533:  ;; clojure -M:kondo --lint src test
L87 [RESULT] (subagent ac949) linting took 843ms, errors: 0, warnings: 0
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9e38f5be-3bf9-4dc3-bc55-e7013bc8dcbb.jsonl
  lines: 234-245
  date: 2026-09-05
  jev: {any_papercut: 0.72, env_toolchain: 0.89, stale_state: 0.16, verify_mismatch: 0.29, misleading_code: 0.21, hidden_coupling: 0.47, stale_docs: 0.30, tool_footgun: 0.61, flaky: 0.21, agent_bug: 0.60, wasted_effort: 0.28, user_correction: 0.07}

- L234-L239: `zsh: command not found: clj-kondo`; `WARNING: Specified aliases are undeclared and are not being used: [:cljfmt]`, `Unqualified function can't be resolved: check`.
- L244-L245: `backend.yml` shows `run: ./bin/mage kondo`.
- L448-L449: `clojure -M:kondo --lint ...` → `errors: 0, warnings: 0`; `./bin/mage cljfmt-files ...` clean.

- L234-L239: both lint guesses fail.
- L244-L245: CI workflow read to find the real commands.
- Cost: 2 calls.

```
L234 [CALL] echo "=== kondo ==="; clj-kondo --lint src/metabase/cmd/copy.clj test/metabase/cmd/copy_test.clj 2>&1 | tail -5; echo; echo "=== cljfmt ==="; clojure -T:cljfmt check :paths '["src/metabase/cmd/copy.clj" "test/metabase/cmd/copy_test.clj"]' 2>&1 | tail -3; echo "=== CI kondo cmd ==="; /usr/bin/grep -rn 'clj-kondo' .github/workflows/*.yml | ...
L239 [RESULT] === kondo === | zsh: command not found: clj-kondo | === cljfmt === | WARNING: Specified aliases are undeclared and are not being used: [:cljfmt] | Unqualified function can't be resolved: check | === CI kondo cmd === | .github/workflows/backend.yml:150:  be-linter-clj-kondo: | ...
L244 [CALL] sed -n '150,170p' .github/workflows/backend.yml; echo "=== cljfmt in CI ==="; ...
L245 [RESULT] be-linter-clj-kondo: | ... |       - name: Run clj-kondo |         run: ./bin/mage kondo | ...
L448 [CALL] echo "=== kondo ==="; clojure -M:kondo --lint src/metabase/cmd/copy.clj test/metabase/cmd/copy_test.clj 2>&1 | tail -3; echo "=== cljfmt ==="; ./bin/mage cljfmt-files src/metabase/cmd/copy.clj test/metabase/cmd/copy_test.clj ...
L449 [RESULT] === kondo === | WARNING: error while reading .../.clj-kondo/inline-configs/metabase.lib.expression.cljc/config.edn (Invalid token: <vector:) | linting took 303ms, errors: 0, warnings: 0 | === cljfmt === | ...
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/7496be2b-9961-45b7-8797-6ed8b8fdfcc2/subagents/agent-ae3923bd48afbbf5d.jsonl
  lines: 277-297
  date: 2026-09-11
  jev: {any_papercut: 0.80, env_toolchain: 0.81, stale_state: 0.15, verify_mismatch: 0.50, misleading_code: 0.34, hidden_coupling: 0.63, stale_docs: 0.35, tool_footgun: 0.75, flaky: 0.28, agent_bug: 0.31, wasted_effort: 0.45, user_correction: 0.09}

- L277-L278: `timeout 400 ./bin/kondo.sh src/...` → `timeout: failed to run command './bin/kondo.sh': No such file or directory`.
- L280-L281: `.github/workflows/backend.yml` shows `run: ./bin/mage kondo`.
- L286-L297: `./bin/mage kondo <files>` → `errors: 0, warnings: 0`.

- L277-L278: guessed script missing.
- L280-L281: finds the CI command.
- L286-L297: lint runs (auto-backgrounded, see that record).
- Cost: 2 calls.

```
L277 [CALL] cd ~/src/mb/wt/<branch> && timeout 400 ./bin/kondo.sh src/metabase/analytics/llm_token_usage.clj src/metabase/analytics/prometheus.clj ...
L278 [RESULT] timeout: failed to run command './bin/kondo.sh': No such file or directory
L280 [CALL] cd ~/src/mb/wt/<branch> && /usr/bin/grep -n "kondo\|cljfmt\|eastwood" -A 6 .github/workflows/backend.yml | /usr/bin/grep -n "run:\|name:" | head -30
L281 [RESULT] ... 16:154-    name: Clj-Kondo | 20:159:      - name: Run clj-kondo | 21:160:        run: ./bin/mage kondo | ...
L286 [CALL] cd ~/src/mb/wt/<branch> && timeout 900 ./bin/mage kondo src/metabase/analytics/llm_token_usage.clj ...
L297 [RESULT] Running Kondo on: [...] | linting took 470ms, errors: 0, warnings: 0
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ac37fe71-7046-48c1-885f-5bf5d9754c26.jsonl
  lines: 1680-1704
  date: 2026-09-10
  jev: {any_papercut: 0.85, env_toolchain: 0.90, stale_state: 0.26, verify_mismatch: 0.79, misleading_code: 0.40, hidden_coupling: 0.82, stale_docs: 0.34, tool_footgun: 0.60, flaky: 0.47, agent_bug: 0.93, wasted_effort: 0.66, user_correction: 0.07}

- L1688: `mise ERROR "clj-kondo" couldn't exec process: No such file or directory`.
- L1692: `clj-kondo not found`.
- L1700: `.github/workflows/backend.yml:160: run: ./bin/mage kondo`.

- L1680-L1688: bare clj-kondo via mise fails.
- L1691-L1696: PATH searched.
- L1699-L1704: CI workflow read, `./bin/mage kondo` runs clean.
- Cost: 4 tool calls.

```
L1680 [CALL] Bash: cd ~/src/mb/wt/<branch> && mise exec -- clj-kondo --lint src/metabase/metabot/self.clj src/metabase/metabot/schema.clj ...
L1688 [RESULT] mise ERROR "clj-kondo" couldn't exec process: No such file or directory | mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02) | ...
L1691 [CALL] Bash: cd ~/src/mb/wt/<branch> && ls .clj-kondo 2>/dev/null | head -3; which clojure clj-kondo 2>/dev/null; ...
L1692 [RESULT] README.md | config | config.edn | ~/.local/share/mise/shims/clojure | clj-kondo not found
L1699 [CALL] Bash: cd ~/src/mb/wt/<branch> && /usr/bin/grep -rn "clj-kondo\|kondo" .github/workflows/*.yml | head -5
L1700 [RESULT] ... .github/workflows/backend.yml:150: be-linter-clj-kondo ... .github/workflows/backend.yml:160: run: ./bin/mage kondo
L1704 [RESULT] ... Running Kondo on: [src/metabase/metabot/self.clj ...] | linting took 363ms, errors: 0, warnings: 0
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/b95fa36b-8d10-4667-8dcc-e441cdf5aced.jsonl
  lines: 186-199
  date: 2026-09-11
  jev: {any_papercut: 0.82, env_toolchain: 0.90, stale_state: 0.16, verify_mismatch: 0.20, misleading_code: 0.20, hidden_coupling: 0.28, stale_docs: 0.31, tool_footgun: 0.64, flaky: 0.90, agent_bug: 0.56, wasted_effort: 0.46, user_correction: 0.15}

- L187: `zsh: command not found: clj-kondo`.
- L191: `mise ERROR Version: 2026.9.1 ...` for `mise exec -- clj-kondo --version`.
- L195: `.github/workflows/backend.yml:160: run: ./bin/mage kondo`.

- L186-L191: two failed invocations.
- L194-L195: CI workflow grep.
- L198-L199: mage kondo runs.
- Cost: 3 extra tool calls.

```
L186 [CALL] Bash: clj-kondo --lint src/metabase/queries/models/card.clj test/metabase/queries/models/card_test.clj 2>&1 | tail -20
L187 [RESULT] zsh: command not found: clj-kondo
L190 [CALL] Bash: ls .clj-kondo/ 2>/dev/null | head; command -v clj-kondo mise; mise exec -- clj-kondo --version 2>&1 | tail -2
L191 [RESULT] README.md | config | config.edn | macros | ratchets.edn | src | test | mise | mise ERROR Version: 2026.9.1 macos-arm64 (2026-09-02) | mise ERROR Run with --verbose or MISE_VERBOSE=1 for more information
L194 [CALL] Bash: grep -rn "kondo" package.json .github/workflows/*.yml 2>/dev/null | grep -i "run\|clj-kondo --lint\|command" | head -10
L195 [RESULT] .github/workflows/backend.yml:88: run: ./bin/mage kondo-ratchets | .github/workflows/backend.yml:159: - name: Run clj-kondo | .github/workflows/backend.yml:160: run: ./bin/mage kondo | ...
```
