# Fix log

`.claude/fix-log.md` — memory of bug fixes across sessions.
Create if missing. One entry per fix, appended:

`<symptom> → <cause> → <what changed and why>`

- Only bug fixes are logged, not feature or style changes.
- A symptom that already has an entry means the earlier fix failed —
  diagnose again and try a different approach; never re-apply the same
  edit.
- Never undo or rewrite logged code without first appending an entry that
  explains why its diagnosis was wrong, and telling the user which bug
  may come back.
