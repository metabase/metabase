---
title: Normalization/validation placed in a defsetting `:setter` never applies to env-var values, so moving a trim from the getter into the setter silently regressed `MB_*` handling
slug: defsetting-setter-normalization-bypassed-by-env
kind: codebase-trap
impact: introduced-bug
severity: low
status: open
area: src/metabase/settings/models/setting.clj (defsetting :setter docs); enterprise osi_generation/settings.clj; metabot/settings.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 2155-2183, 3525-3560
    date: 2026-08-30
    jev: {not in a flagged chunk; the pattern recurs in chunk 11 (3334-3682): self_inflicted_bug 0.87, misleading_signal 0.92}
---
## Summary
During the rework, the agent moved `u/trimmed-string` normalization of `osi-generation-model` into a `:setter`
("Normalize provider/model settings on set"). It dropped the trim from the custom getter, which reads
`(setting/get-value-of-type :string :osi-generation-model)`. An env var such as `MB_OSI_GENERATION_MODEL="  anthropic/claude-haiku-4-5  "`
never passes through the setter, so the padded or whitespace-only value came back verbatim. roborev 5087
caught it. The same class of problem came back at L3525-3560: the readiness getter
(`osi-generation-llm-configured?`, `:visibility :public`) had to call `validate-model-ref!`, because an env
value could hold a reference the setter would have rejected. It needed a try/catch so a bad env value could
not make a public setting read throw.

## Symptom
```
L2159 roborev 5087 (Low): Environment values bypass the normalizing setter, so a padded or whitespace-only
MB_OSI_GENERATION_MODEL is returned verbatim.
L2179 (fix reverted) expected: "anthropic/claude-haiku-4-5"  actual: "  anthropic/claude-haiku-4-5  "
                     expected: "anthropic/claude-sonnet-4-6" actual: "   "
L3553 (try/catch removed) clojure.lang.ExceptionInfo: Invalid Azure model "azure/not-a-family" ...
```

## Timeline
- L2162: "I moved the trim into the setter and dropped it from the read path, but env bypasses setters."
- L2166-2179: restore read-side trim; test with `mt/with-temp-env-var-value!`; revert-proof.
- L3525-3560: y832, readiness validates the ref from any source; the try/catch is load-bearing for env values.

## Root cause
`defsetting` docs (`setting.clj` ~L1373-1377) describe `:setter` as "A custom setter fn ... Overrides the default
implementation" and say nothing about env vars. Values from `MB_*` env vars reach the getter through
`env-var-value` without going through the setter, so validation and normalization written there are app-DB-only.

## Why agents fall for it
"Normalize on write" is a clean pattern, and the setter looks like the single write path. The env source is
invisible unless you already know `get-value-of-type` consults `env-var-value` first.

## Current state
`src/metabase/settings/models/setting.clj:1373-1377` (`:setter` doc) has no env caveat. `env-var-value` is at
`:505`. Not in memory or CLAUDE.md.

## Suggested fix
- Add one line to the `:setter` doc: "Env-var values bypass `:setter`. Put normalization/validation that must hold for every source in `:getter`, or in a shared fn both call."
- Optionally support a `:normalize` key in defsetting that is applied on both read (env/db) and write.

## Detection signal
A diff that removes trimming/validation from a `:getter` while adding it to `:setter`. Tests for a setting that
never use `mt/with-temp-env-var-value!`.

## Raw excerpts
```
L2164 (defn- -osi-generation-model
  [] (or (setting/get-value-of-type :string :osi-generation-model)
         (metabot.settings/llm-metabot-provider)))
```
