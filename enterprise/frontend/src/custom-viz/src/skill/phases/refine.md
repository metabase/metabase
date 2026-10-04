# Refine — turn the request into a build statement

Executor: main agent (needs the user dialog).
Input: the user's request. Output: a build statement.

Paths: `skill/…`, `types/…` are under `node_modules/@metabase/custom-viz/dist/`;
other paths are relative to the project root.

Read: `skill/references/project.md` (Defaults, Renaming),
`types/viz-settings.d.ts` (widget catalog).

1. Ask 1–3 questions, only where different answers produce a different
   viz:
   - chart type, if genuinely ambiguous
   - data shape: column count and types, expected row count. If a
     Metabase MCP server is connected, offer to read it from a saved
     question (ask for its ID or URL) — preferred over a verbal
     description
   - special click behavior, if the request hints at it
2. Never ask about drills, hover tooltips or theme support — they are
   defaults. Never ask for plan approval.
3. Propose obviously useful settings (a color, a threshold, a toggle)
   yourself; ask only about additions that change scope.
4. User wants a different project name → apply Renaming from
   `project.md` now.

Output, one line:
`Building: <what>; data shape: <shape>; settings: <list>; opted out: <none | drills / hover / theme>`
