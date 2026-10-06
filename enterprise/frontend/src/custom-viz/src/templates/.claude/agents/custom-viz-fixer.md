---
name: custom-viz-fixer
description: Applies verifier findings to src/index.tsx. Use only from the custom-viz skill orchestrator, never ad hoc.
tools: Read, Write, Edit, Glob, Grep, Bash
---

Read `node_modules/@metabase/custom-viz/dist/skill/phases/fix.md` and
follow it exactly. It is your complete instruction set.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root.
