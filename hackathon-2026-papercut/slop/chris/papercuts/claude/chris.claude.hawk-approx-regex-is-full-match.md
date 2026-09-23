---
title: A regex expected value in mb.hawk's `=?` is a full match (re-matches), so a "contains" pattern like #"environment variable" fails against a longer message
slug: hawk-approx-regex-is-full-match
kind: test-harness
impact: wasted-time
severity: low
status: documented-still-hit
area: mb.hawk =? (approximately-equal) in Metabase tests
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-80394-metabot-tennant/b31b1fd7-7c96-47c9-95ad-9bfbd57f1c09.jsonl (deleted; reconstructed from redacted chunks)
    lines: 437-444
    date: 2026-08-21
    jev: {self_inflicted_bug: 0.75, tool_misuse: 0.89, misleading_signal: 0.68, user_correction: 0.82, codebase_trap: 0.68, flailing: 0.46, env_friction: 0.85}
---
## Summary
The agent added `mode-switch-rejected-under-env-var-test` and asserted `(is (=? #"environment variable" (mt/user-http-request :crowberto :delete 400 ".../advanced")))`. The endpoint returned "The permission mode is set by the MB_METABOT_ADVANCED_PERMISSIONS environment variable." and the assertion failed: hawk's `=?` treats a regex as `re-matches`, a whole-string match. The agent recognised this ("only my regex was wrong (`=?` regex is a full match)") and switched to an exact string. That cost one test cycle (~25 s plus the JVM start).

## Symptom
```
L439 [RESULT] expected: #"environment variable"
  actual: "The permission mode is set by the MB_METABOT_ADVANCED_PERMISSIONS environment variable."
54 assertions, 2 failures, 0 errors.
L442 [ASSISTANT] The guard works; only my regex was wrong (`=?` regex is a full match). Fixing the assertion to exact string.
```

## Timeline
- L438: appends the test with `=? #"environment variable"` for both verbs and runs it on H2.
- L439: 2 failures.
- L443-444: exact string; 54 assertions, 0 failures.

## Root cause
Other Clojure test helpers (`thrown-with-msg?`, and `re-find` idioms) use substring search, while hawk's `=?` uses `re-matches`. Nothing in the failure output says "full match".

## Why agents fall for it
`thrown-with-msg?` in clojure.test uses `re-find`, so the same regex literal behaves differently one macro over.

## Current state
Hawk behaviour is unchanged. It is documented in memory `reference_hawk_eq_matcher_semantics.md` (created/modified 2026-08-31, ten days **after** this occurrence), which MEMORY.md links as "[=? matcher semantics] — regex = full match; maps match partially". Not in the repo CLAUDE.md or the clojure-write skill.

## Suggested fix
Add one line to `.claude/skills/clojure-write/SKILL.md` (testing section): "`=?` regexes are full matches; use `#\".*foo.*\"` or `#(str/includes? % \"foo\")`." Hawk could also print "(regex must match the whole string)" when a regex `=?` fails but `re-find` would have succeeded.

## Detection signal
A test failure where `expected: #"..."` and the actual string contains that literal text.

## Raw excerpts
See Symptom.
