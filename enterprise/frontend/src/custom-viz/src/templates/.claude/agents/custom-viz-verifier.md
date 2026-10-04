---
name: custom-viz-verifier
description: Fresh-eyes reviewer of src/index.tsx; returns findings. Use only from the custom-viz skill orchestrator, never ad hoc.
tools: Read, Glob, Grep, Bash
hooks:
  PreToolUse:
    - matcher: "Read|Glob|Grep|Bash"
      hooks:
        - type: command
          command: 'node "$CLAUDE_PROJECT_DIR/node_modules/@metabase/custom-viz/dist/skill/agent-guard.mjs" verifier || exit 2'
---

Read `node_modules/@metabase/custom-viz/dist/skill/phases/verify.md` and
follow it exactly. It is your complete instruction set.

Paths: `skill/…`, `types/…`, `index.d.ts` are under
`node_modules/@metabase/custom-viz/dist/`; other paths are relative to
the project root.
