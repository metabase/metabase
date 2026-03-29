Generate a UX testing report based on the tasks you've worked on in this session.

## Instructions

1. **Identify the reporting window**: Check for the most recent reset marker in `.uxbot/` (files named `reset-*.txt`). Only include activity that happened AFTER the last reset. If no reset file exists, include everything.

2. **For each task the user gave you** (do NOT include casual questions, non-task interactions, or general setup work like waiting for the backend to start — unless setup issues actually blocked you from completing a task):
   - **Task**: What were you asked to do?
   - **Approach**: What did you try first? What was your thinking?
   - **Steps taken**: Walk through what you did, step by step
   - **Struggles**: Where did you get confused, try multiple things, or feel unsure? This is the most important part — be honest and detailed about friction.
   - **Resolution**: Did you complete the task? If not, what blocked you?
   - **Screenshots**: Link to any screenshots taken during this task (from `.uxbot/screenshots/`)
   - **Time spent**: Estimate how long this task took

3. **Summary section** at the end:
   - Tasks completed vs. not completed
   - Top friction points (ranked by severity)
   - Features that were easy/intuitive to use
   - Suggestions for improvement (from the user's perspective, not a developer's)

4. **Write the report** to `.uxbot/report-<timestamp>-<slug>.md` where:
   - `<timestamp>` is `YYYYMMDD-HHMMSS`
   - `<slug>` is a short kebab-case description of the tasks covered (e.g., `create-question-and-dashboard`, `filter-setup`, `admin-permissions`). Keep it under 40 characters.
   - Example: `.uxbot/report-20260327-153000-create-question-and-dashboard.md`
   - Use relative paths for screenshot references (e.g., `screenshots/filename.png` relative to `.uxbot/`).

5. **Generate PDF**: Run pandoc **from the `.uxbot/` directory** so relative screenshot paths resolve correctly:
   ```
   cd .uxbot && pandoc report-<timestamp>-<slug>.md -o report-<timestamp>-<slug>.pdf --pdf-engine=weasyprint
   ```

6. **Present a brief summary** to the user with **full absolute paths** to both the markdown and PDF reports (use `pwd` to get the worktree root, e.g., `/Users/.../metabase-4__worktrees/uxbot-master/.uxbot/report-...-slug.pdf`).

## Tone

Write from the perspective of a user experience researcher observing a user. Be objective and specific. "I couldn't find the button" is better than "the UI is bad." Include what you expected to see vs. what you actually saw.
