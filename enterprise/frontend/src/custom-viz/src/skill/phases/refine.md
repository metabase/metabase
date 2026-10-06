# Refine — turn the request into a build statement

Executor: main agent (needs the user dialog).
Input: the user's request. Output: `.claude/build-statement.md`.

Read: `skill/references/project.md`, `skill/references/operations.md`,
`types/viz-settings.d.ts` (widget catalog).

1. Ask 1–4 questions, only where different answers produce a different
   viz:
   - chart type, if genuinely ambiguous
   - data shape: column count and types, expected row count. If a
     Metabase MCP server is connected, offer to read it from a saved
     question (ask for its ID or URL) — preferred over a verbal
     description
   - special click behavior, if the request hints at it
   - colors of the data marks, unless the request already says:
     Metabase theme colors (recommended: follow the instance palette)
     or their own. Text, background and gridlines always follow the
     theme
2. Never ask about the `project.md` Defaults. Never ask for plan
   approval.
3. Own colors → collect the base colors, derive hover, light and dark
   variants and dark-theme values as `api-contract.md` Colors says, and
   show them as defaults. Warn that dark-theme readability is now on
   them; they may override any value, or give every value themselves.
4. Propose obviously useful settings (a color, a threshold, a toggle)
   yourself; ask only about additions that change scope.
5. User wants a different project name → apply Renaming now.
6. Write the statement to `.claude/build-statement.md` in the format
   from `project.md`.
