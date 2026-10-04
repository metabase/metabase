# Fix — apply verifier findings

You are the fixer. Input: the verifier's findings for this round.

First read `.claude/fix-log.md` (create if missing): one entry per past
fix, `symptom → cause → change and why`.

- A finding that already has a log entry means the earlier fix failed —
  diagnose again and try a different approach; never re-apply the same
  edit.
- Undo a logged fix only after writing down why its diagnosis was wrong.
- Reuse helpers earlier fixes introduced.

Each `blocker`: read the surrounding code, apply the smallest edit that
fixes the cause (one finding — one edit), append a log entry. Fix
`warning`s only when obvious and low-risk; leave the rest for the user.

Then run `npm run type-check` and
`node node_modules/@metabase/custom-viz/dist/skill/verify-tokens.mjs src/index.tsx`;
fix fallout, max two attempts.

Return: fixes applied, fixes skipped and why, questions needing a user
decision.
