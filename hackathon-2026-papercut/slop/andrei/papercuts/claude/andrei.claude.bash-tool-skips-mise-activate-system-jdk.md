---
title: `mise activate` in .zshrc only updates PATH from prompt and cd hooks, which never fire in the Bash tool, so bare `java` and `clojure` resolved to the system JDK 21 while the repo and CI use Temurin 25, and tests and Eastwood silently ran on the wrong JDK
slug: bash-tool-skips-mise-activate-system-jdk
kind: env-friction
impact: wasted-time
severity: medium
status: fixed # on 2026-09-23 the Bash tool PATH resolves java, node, bun and clojure through ~/.local/share/mise/shims
area: ~/.zshrc mise activation, Bash tool shell, ./bin/test-agent, `clojure -X:…:eastwood/test`
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-afc73a08506b2ede6.jsonl
    lines: 62-105
    date: 2026-09-03
    jev: {any_papercut: 0.89, env_toolchain: 0.92, stale_state: 0.32, verify_mismatch: 0.67, misleading_code: 0.41, hidden_coupling: 0.52, stale_docs: 0.37, tool_footgun: 0.82, flaky: 0.25, agent_bug: 0.82, wasted_effort: 0.70, user_correction: 0.07}
---
## Summary
A review subagent started `./bin/test-agent` and the Eastwood changed-tests gate without `mise exec`. `which java` showed `/usr/bin/java` (OpenJDK 21) and `which clojure` the Homebrew CLI, not the Temurin 25 the repo's mise.toml pins and CI uses. The agent caught it and reran both gates under `mise exec`. Treating `mise exec -- <cmd>` as a fallback for missing tools does not cover a wrong-version tool that is on PATH.

## Symptom
L63 ends `/opt/homebrew/bin/clojure ⏎ /usr/bin/java ⏎ bb not found ⏎ openjdk version "[REDACTED]" 2026-08-18 LTS` (a JDK 21 build); L93: the agent notes that tests and the Eastwood gate passed but ran on the wrong JDK.

## Timeline
- L66, L68: test-agent and the Eastwood gate started without `mise exec`.
- L62-L63: `which java` → /usr/bin/java.
- L93: agent notices; L95-L96 reruns both under `mise exec`.
- L105: `== Eastwood 1.4.3 Clojure 1.12.3 JVM 25.0.3 ==`.
- Cost: two redundant JVM runs, and verification results that briefly rested on the wrong JDK.

## Root cause
`eval "$(mise activate zsh)"` keeps PATH current through precmd and chpwd hooks. The Bash tool runs non-interactive `zsh -c` from a snapshot, so the hooks never run after a `cd` into the repo and PATH kept system tools first (exactly how the snapshot's PATH was captured is not visible). The repo's own mise.toml recommends shims for callers that do not cd interactively.

## Why agents fall for it
The binaries exist and run, and a green run looks the same on JDK 21 as on 25; `mise exec` reads as a fallback for missing tools, not as a version check.

## Current state
2026-09-23: `which java` in the Bash tool → ~/.local/share/mise/shims/java, so the environment now resolves correctly.

## Suggested fix
- Keep mise shims on PATH for non-interactive shells (now the case).
- Run JVM and node tooling via shims or `mise exec --`, and check `java -version` against mise.toml.
- Cheap guard: bin/test-agent warns when the JVM major version differs from the version pinned in mise.toml.

## Detection signal
`which java` → /usr/bin/java in a Metabase task, an Eastwood banner with `JVM 21`, or an `openjdk version "21` line in a test log when mise.toml pins 25.

## Raw excerpts
```
L63 [RESULT] =====mage tasks (kondo/fmt)===== … =====which tools===== ⏎ /opt/homebrew/bin/clojure ⏎ /usr/bin/java ⏎ bb not found ⏎ openjdk version "[REDACTED]" 2026-08-18 LTS
L66 [CALL Bash] cd ~/src/mb/wt/<branch> && … ./bin/test-agent :only '[metabase.metabot.self.openai.chat-completions-test metabase.metabot.self.openrouter-test metabase.metabot.self-test]' > $SCRATCH/test-run.log 2>&1; …
L68 [CALL Bash] cd ~/src/mb/wt/<branch> && clojure -X:dev:ee:ee-dev:drivers:drivers-dev:test:eastwood/test :namespaces "[…]" > $SCRATCH/eastwood-test.log 2>&1; …
L95 [CALL Bash] cd ~/src/mb/wt/<branch> && mise exec -- ./bin/test-agent :only '[…]' > $SCRATCH/test-run-j25.log 2>&1; …
L105 [RESULT] =====test-run-j25===== ⏎ … All tests passed. … =====eastwood-j25===== ⏎ == Eastwood 1.4.3 Clojure 1.12.3 JVM 25.0.3 ==
```
