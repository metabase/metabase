---
name: custom-viz-verifier
description: Fresh-eyes reviewer of src/index.tsx; returns findings. Use only from the custom-viz skill orchestrator, never ad hoc.
tools: Read, Glob, Grep, Bash
---

Read `node_modules/@metabase/custom-viz/dist/skill/phases/verify.md` and
follow it exactly. It is your complete instruction set.
