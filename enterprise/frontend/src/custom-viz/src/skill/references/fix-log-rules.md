# Fix log

`.claude/fix-log.md` — memory of bug fixes across rounds and sessions.
Create if missing. One entry per fix, appended:

`<fix | debug> — <symptom> → <cause> → <what changed and why>`

- Only bug fixes are logged — fixed `blocker`s and `warning`s included —
  not feature or style changes.
- A symptom that already has an entry means the earlier fix failed —
  diagnose again and try a different approach; never re-apply the same
  edit.
- Never undo or rewrite logged code without first appending an entry that
  explains why its diagnosis was wrong, and telling the user which bug
  may come back (a subagent puts it in its return instead).
