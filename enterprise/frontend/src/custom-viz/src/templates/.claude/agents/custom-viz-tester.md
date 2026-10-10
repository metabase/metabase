---
name: custom-viz-tester
description: Writes src/index.test.tsx from a build statement without reading the viz code. Use only from the custom-viz skill orchestrator, never ad hoc.
tools: Read, Write, Edit, Glob, Grep, Bash
---

Read `node_modules/@metabase/custom-viz/dist/skill/phases/test.md` and
follow it exactly. It is your complete instruction set.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root.
