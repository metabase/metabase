Generate a UX testing report based on the tasks you've worked on in this session.

## Instructions

1. **Gather environment info for the report header**: Run these commands and include the results at the top of the report:
   - `./bin/mage -bot-git-readonly git branch --show-current` — the worktree branch name
   - `./bin/mage -bot-git-readonly git rev-parse --short HEAD` — the current commit hash
   - `grep MB_DB_TYPE mise.local.toml` — the database type (postgres, mysql, etc.)
   - Note the current time as the report end time. The start time is when the first task in the reporting window was given.

   Format the header as:
   ```
   **Date:** YYYY-MM-DD
   **Branch:** <branch> (commit <hash>)
   **Database:** <type>
   **Session:** <start time> — <end time>
   ```

2. **Identify the reporting window**: Check for the most recent reset marker in `.bot/uxbot/` (files named `reset-*.txt`). Only include activity that happened AFTER the last reset. If no reset file exists, include everything.

3. **For each task the user gave you** (do NOT include casual questions, non-task interactions, or general setup work like waiting for the backend to start — unless setup issues actually blocked you from completing a task):
   - **Task**: What were you asked to do?
   - **Approach**: What did you try first? What was your thinking?
   - **Steps taken**: Walk through what you did, step by step
   - **Struggles**: Where did you get confused, try multiple things, or feel unsure? This is the most important part — be honest and detailed about friction.
   - **Resolution**: Did you complete the task? If not, what blocked you?
   - **Screenshots**: Link to any screenshots taken during this task (from `.bot/uxbot/screenshots/`)
   - **Time spent**: Estimate how long this task took

4. **Summary section** at the end:
   - Tasks completed vs. not completed
   - Top friction points (ranked by severity)
   - Features that were easy/intuitive to use
   - Suggestions for improvement (from the user's perspective, not a developer's)

5. **Write the report** to `.bot/uxbot/report-<timestamp>-<slug>.md` where:
   - `<timestamp>` is `YYYYMMDD-HHMMSS`
   - `<slug>` is a short kebab-case description of the tasks covered (e.g., `create-question-and-dashboard`, `filter-setup`, `admin-permissions`). Keep it under 40 characters.
   - Example: `.bot/uxbot/report-20260327-153000-create-question-and-dashboard.md`
   - Use relative paths for screenshot references (e.g., `screenshots/filename.png` relative to `.bot/uxbot/`).

6. **Generate PDF**: Run `md-to-pdf` **from the `.bot/uxbot/` directory** so relative screenshot paths resolve correctly:
   ```
   ./bin/mage -bot-md-to-pdf .bot/uxbot/report-<timestamp>-<slug>.md
   ```

7. **Present a brief summary** to the user with **full absolute paths** to both the markdown and PDF reports (use `pwd` to get the worktree root, e.g., `/Users/.../metabase-4__worktrees/uxbot-master/.bot/uxbot/report-...-slug.pdf`).

## Tone

Write from the perspective of a user experience researcher observing a user. Be objective and specific. "I couldn't find the button" is better than "the UI is bad." Include what you expected to see vs. what you actually saw.
