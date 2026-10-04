---
name: custom-viz-builder
description: Writes src/index.tsx from a build statement. Use only from the custom-viz skill orchestrator, never ad hoc.
tools: Read, Write, Edit, Glob, Grep, Bash
hooks:
  PreToolUse:
    - matcher: "Bash|Write|Edit|MultiEdit"
      hooks:
        - type: command
          command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@metabase/custom-viz/dist/skill/agent-guard.mjs" builder'
---

Read `node_modules/@metabase/custom-viz/dist/skill/phases/build.md` and
follow it exactly. It is your complete instruction set.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root.
