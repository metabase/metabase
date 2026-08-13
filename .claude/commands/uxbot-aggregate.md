Aggregate per-task UXBot reports into an overall UX report, looking for patterns across tasks.

## Instructions

1. **List the session directories**: Every UXBot run lives in `.bot/uxbot/<TIMESTAMP>/` and (if it ran a task) contains a `task-report.md`. Run:
   ```
   ls -1d .bot/uxbot/*/ 2>/dev/null
   ```
   Each directory's name is a `YYYYMMDD-HHMMSS` timestamp.

2. **Tell the user what you're using BEFORE generating the report.** Print a short message that:
   - Tells the absolute path of the root directory you are reading from
   - Lists the number of tasks you are agggregating.
   - States the timeframe — the earliest and latest timestamps among the directories.
   - Tells the user: "If there are sessions you don't want included in this aggregate, delete those directories under `.bot/uxbot/` and re-run `/uxbot-aggregate`. I am proceeding with all of them now."

   Do NOT wait for confirmation. Continue immediately.

3. **Read the per-task reports**: For each session directory, read every `task-report*.md` it contains (a session may have several if the user gave multiple tasks). Skip directories that have no `task-report*.md` (those sessions were started but never completed a task). Also collect the screenshot paths each report references so you can re-embed them.

   **Embed screenshots inline, do not link to them.** When you cite a finding from a per-task report, use Markdown image syntax (`![caption](relative/path.png)`) so the screenshot renders directly in the aggregate PDF. The path must be relative to `.bot/uxbot/` (e.g. `20260504-092131/output/01-foo.png`), since the PDF is generated from that directory. After every image leave a blank line so the caption flows correctly. Verify in the rendered PDF that you see actual images, not URLs.

4. **Aggregate — look for patterns, do not re-specify findings.** The per-task reports already follow a consistent format (task, approach, steps, struggles, resolution, screenshots, time spent). Your job is the layer above that:
   - **Cross-task themes**: Friction points that appear in more than one task (e.g., "modal-data-loss came up in 3 of 5 user-management tasks"). Quote or cite the per-task reports.
   - **Severity ranking across the whole session set**, not within one task.
   - **Areas of Metabase that worked well repeatedly** — patterns worth preserving.
   - **Suggestions for improvement** at the product level, grounded in the recurring evidence.
   - **Outliers**: Single-task findings that are severe enough to call out even though they only happened once.

   Do NOT re-list every step from every task — the per-task reports are linked from this aggregate and the reader can drill in. Keep this report at the pattern/synthesis level.

5. **Header**: Include this header at the top of the aggregate:
   ```
   **Date:** YYYY-MM-DD
   **Branch:** <branch> (commit <hash>)
   **Database:** <type>
   **Sessions covered:** <count> (from <earliest timestamp> to <latest timestamp>)
   ```

   Get branch / commit / db type with:
   - `git -C $(pwd) branch --show-current`
   - `git -C $(pwd) rev-parse --short HEAD`
   - `grep MB_DB_TYPE mise.local.toml` (or check `./bin/mage -bot-server-info` if not in mise.local.toml)

6. **Link each per-task report from the aggregate.** Include a "Per-task reports" section near the top with one bullet per session: timestamp, task title (pull from each report's first heading), and a relative link to its `task-report.pdf` (preferred) or `task-report.md`.

7. **Write the aggregate** to `.bot/uxbot/aggregate-<timestamp>-<slug>.md` where:
   - `<timestamp>` is the current `YYYYMMDD-HHMMSS`.
   - `<slug>` is a short kebab-case description of the dominant theme across the sessions (e.g., `admin-permissions`, `dashboard-authoring`, `mixed-session`). Keep it under 40 characters.

8. **Generate PDF**:
   ```
   ./bin/mage -bot-md-to-pdf .bot/uxbot/aggregate-<timestamp>-<slug>.md
   ```

9. **Present a brief summary to the user with absolute paths** to both the markdown and PDF files (use `pwd` to construct the absolute path).

## Tone

You are synthesizing across many sessions. Stay objective. Quote per-task reports when possible — recurring user friction is more credible when readers can see it appeared independently across multiple sessions.
