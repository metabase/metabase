---
title: When the local dev instance comes up on a fresh app DB it sits at the first-run setup wizard, which needs an admin password agents may not enter, so a live-app screenshot task silently degraded into 16 minutes of hand-built HTML mockups
slug: dev-instance-setup-wizard-blocks-agents
kind: env-friction
impact: wasted-time
severity: medium
status: unknown
area: local dev instance, first-run setup flow, agents' no-account-creation rule
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8/subagents/agent-a413c65df7ca250d8.jsonl
    lines: 42-210
    date: 2026-09-03
    jev: {any_papercut: 0.85, env_toolchain: 0.87, stale_state: 0.13, verify_mismatch: 0.07, misleading_code: 0.21, hidden_coupling: 0.33, stale_docs: 0.30, tool_footgun: 0.80, flaky: 0.29, agent_bug: 0.25, wasted_effort: 0.78, user_correction: 0.05}
---
## Summary
A subagent asked for live before/after screenshots opened localhost:3000 and found "Welcome to Metabase … Let's get started": the app DB was new (an untracked `metabase.db.mv.db.bak-…` in the checkout suggests the default H2 file had been moved aside that morning). Creating the admin account is off-limits to agents, and there is no scripted way to seed one, so it fell back to its last-resort option and hand-built HTML mockups for about 16 minutes. The user rejected the mockups, completed the wizard and a second subagent redid the capture.

## Symptom
L46: page text "Welcome to Metabase ⏎ Looks like everything is working. Now let's get to know you…"; L210: the subagent reports a never-configured instance at the first-run setup wizard and says it treated creating the admin account as covered by its no-account-creation/no-password-entry rule.

## Timeline
- L42-L48: navigates to the app, lands on the setup wizard.
- L50-L208: Storybook and RTL rejected, static HTML mockups built from the component CSS and screenshotted with headless Chrome.
- L210: reports mockups (1,000 s of subagent time).
- Main L1741 and L1769: user finishes the wizard; a new subagent is told the earlier mockups are not acceptable.
- Cost: a 16-minute subagent run thrown away plus a user round trip.

## Root cause
Nothing seeds an admin on a fresh dev app DB, and the only path through first-run setup is an interactive form with a password. Why the app DB was fresh is not in the transcript.

## Why agents fall for it
The task framing offered mockups as a fallback, and stopping to ask felt worse than delivering something; nothing tells the agent the wizard can be skipped.

## Current state
not checked.

## Suggested fix
- A dev config file loaded via `MB_CONFIG_FILE_PATH` (or a small dev script) that creates a known local admin without the agent handling a password.
- A dev-server status check could report "setup wizard pending" so agents stop and ask immediately instead of degrading the deliverable.

## Detection signal
Page text "Welcome to Metabase" / "Let's get started" on localhost:3000 during an agent task, or `GET /api/session/properties` with `has-user-setup false`.

## Raw excerpts
```
L42 [CALL mcp__Claude_Browser__navigate] {"url": "http://localhost:3000"}
L46 [RESULT] Title: Metabase ⏎ URL: http://localhost:3000 ⏎ … ⏎ Welcome to Metabase ⏎ Looks like everything is working. Now let's get to know you, connect to your data, and start finding you some answers! ⏎ Let's get started
```
