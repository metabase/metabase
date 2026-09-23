---
title: `semantic.embedding/get-configured-model` returns an unresolved model with no `:embedding-space-id`, but the entity-retrieval index writes that key into a NOT NULL column; only `resolve-model` supplies it
slug: get-configured-model-lacks-embedding-space-id
kind: codebase-trap
impact: introduced-bug
severity: medium
status: open
area: enterprise/backend/src/metabase_enterprise/semantic_search/embedding.clj (get-configured-model, resolve-model); entity_retrieval/index_table.clj
occurrences:
  - transcript: /Users/christruter/.claude/projects/-Users-christruter-workspace-metabase-metabase-pr-03-llm-config/93bd1b32-5bde-4582-9d8a-53740b3387ef.jsonl
    lines: 1742-1754, 1868-1880, 1911
    date: 2026-08-29
    jev: {self_inflicted_bug: 0.97, tool_misuse: 0.74, misleading_signal: 0.56, user_correction: 0.26, codebase_trap: 0.87, flailing: 0.35, env_friction: 0.93}
---
## Summary
After the OSI stack was restacked onto master, the benchmark runner still built its index with
`(or (:model opts) (semantic.embedding/get-configured-model))`. Master's "v2 immutable embedding-space identity"
change had made the index meta row's `embedding_space_id` NOT NULL. That value comes from `(:embedding-space-id
embedding-model)`, and only `resolve-model` produces it. `get-configured-model` returns
`{:provider :model-name :vector-dimensions}`. The run would fail on insert. Module tests stayed green, and roborev
flagged it as High. Later the agent also found that `resolve-model` returns a *closed* descriptor, so the
manifest's `:model-digest` / `:runtime-version` keys were silently dead, and that resolution strips Ollama
provenance that `assert-model-artifact-identity!` relied on (L1911).

## Symptom
```
L1747 [ASSISTANT] `embedding_space_id` is NOT NULL and comes from master's v2 identity — the exact change I merged.
L1749 (defn get-configured-model
  "Get the environments default embedding model according to the ee-embedding-provider / ee-embedding-model settings."
  [] {:provider ... :model-name ... :vector-dimensions ...})
L1752 [ASSISTANT] Confirmed: `get-configured-model` returns no `:embedding-space-id`, `resolve-model` supplies it, and the column is NOT NULL.
```

## Timeline
- L1742-1744: roborev 5061 (High) on `runner.clj:332`.
- L1748-1752: reads both functions and confirms.
- L1753-1754: runner now calls `resolve-model`; tests green.
- L1868-1880: resolved descriptor is closed; `:model-digest`/`:runtime-version` in the manifest are dead keys.
- L1911: "`resolve-model` strips Ollama's provenance which `assert-model-artifact-identity!` demands".
- L1969-2016: user: "i'm nervous about this silent stripping - why does that happen?"

## Root cause
Two functions return "the model", and they differ in whether the value is safe to persist. The name
`get-configured-model` and its docstring give no hint that its result is incomplete for anything that writes
an index row. Production code in `entity_retrieval/core.clj` wraps it in a private `resolved-configured-model`,
which is where the knowledge lives.

## Why agents fall for it
`get-configured-model` is the obvious, widely used entry point (9 files in `enterprise/backend/src` reference it).
The requirement shows up only at INSERT time, and tests that use a stub model or a pre-resolved `:model` opt
never hit it.

## Current state
Still present on master:
- `enterprise/backend/src/metabase_enterprise/semantic_search/embedding.clj:719-724` `get-configured-model` (no space id) vs `:163-166` `resolve-model`.
- `enterprise/backend/src/metabase_enterprise/entity_retrieval/index_table.clj:127` `[:embedding_space_id :text :not-null]`, `:153` `:embedding_space_id (:embedding-space-id embedding-model)`.
- Not documented in CLAUDE.md or memory.

## Suggested fix
- Rename to `configured-model-request` (or add `get-resolved-configured-model`), and put "unresolved; call [[resolve-model]] before persisting or comparing identity" in the docstring.
- Have `index-table` functions validate their `embedding-model` arg against a malli schema that requires `:embedding-space-id` (mu/defn), so the failure names the missing key instead of a DB NOT NULL error.

## Detection signal
A new call site of `get-configured-model` flowing into `index-table/*` or `reconcile/*`. NOT NULL violations on
`embedding_space_id` in test output.

## Raw excerpts
```
L1753 old: (let [model (or (:model opts) (semantic.embedding/get-configured-model))]
      new: (let [model (semantic.embedding/resolve-model (or (:model opts) (semantic.embedding/get-configured-model)))]
L1754 Ran 112 tests ... 358 assertions, 0 failures, 0 errors.
```
