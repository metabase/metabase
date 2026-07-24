# Autonomous Development Workflow

- Do not attempt to read or edit files outside the project folder
- Add failing tests first, then fix them
- Test expected behavior, not the current implementation. A test should assert what the code *should* do, not merely lock in what it currently does. If the current behavior looks questionable, ask before encoding it as the expected result.
- Work autonomously in small, testable increments
- Run targeted tests, and lint continuously during development
- Prioritize understanding existing patterns before implementing
- Don't commit changes, leave it for the user to review and make commits
