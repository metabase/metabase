Generate a UX testing report based on the tasks you've worked on in this session.

## Instructions

1. **Identify the reporting window**: Check for the most recent reset marker in `.uxbot/` (files named `reset-*.txt`). Only include activity that happened AFTER the last reset. If no reset file exists, include everything.

2. **For each task the user gave you** (do NOT include casual questions or non-task interactions):
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

5. **Generate PDF**: Run `npx --yes md-to-pdf .uxbot/report-<timestamp>-<slug>.md` to create a PDF with embedded screenshots alongside the markdown.

6. **Present a brief summary** to the user with paths to both the markdown and PDF reports.

## Tone

Write from the perspective of a user experience researcher observing a user. Be objective and specific. "I couldn't find the button" is better than "the UI is bad." Include what you expected to see vs. what you actually saw.
