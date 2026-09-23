---
title: `SettingsSection` renders its title and description only when `children` is truthy, so the natural `isEnabled && (...)` guard hides the card's own on/off switch and the setting can never be turned back on
slug: settings-section-drops-header-on-falsy-children
kind: codebase-trap
impact: wasted-time
severity: medium
status: open # SettingsSection on master still wraps title, description and children in `{children && ...}`; McpAppsSettings keeps an empty-fragment workaround
area: frontend/src/metabase/settings-components/SettingsSection/SettingsSection.tsx; frontend/src/metabase/admin/ai/McpAppsSettings.tsx and its unit spec
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501.jsonl
    lines: 253-380
    date: 2026-08-27
    jev: {any_papercut: 0.81, env_toolchain: 0.16, stale_state: 0.30, verify_mismatch: 0.40, misleading_code: 0.48, hidden_coupling: 0.84, stale_docs: 0.53, tool_footgun: 0.29, flaky: 0.83, agent_bug: 0.94, wasted_effort: 0.39, user_correction: 0.41}
---
## Summary
Fixing an admin page that showed a copyable MCP URL while the MCP server was off, an agent moved the URL section inside the existing `isEnabled` guard and wrote it as `isEnabled && (...)`. `SettingsSection` only renders its header block when `children` is truthy, and the on/off switch lives in the header's `title`, so with the server off the whole card, switch included, disappeared. The agent's new test caught it and it switched to `isEnabled ? (...) : <></>`; the reviewer warned that a later simplification back to `&&` would show up only as a test-setup timeout that reads like flake, and the coordinator's round-two instruction then assumed a test shape that could not detect it.

## Symptom
Implementer report (L253): `SettingsSection` renders nothing when `children` is falsy, so a bare `&&` made the whole card (title, description and the on/off switch itself) vanish when disabled, with no way to re-enable. Reviewer finding (relayed at L350): the regression would show up only as a timeout inside test setup, which reads as a flake rather than a bug.

## Timeline
- L253: implementer reports the trap, found by its own new test; fix uses an empty fragment as keep-alive children.
- L270: coordinator flags it for the reviewer to trace the re-enable path.
- L344-L350: reviewer confirms by reading SettingsSection, notes the regression would only surface as a setup timeout.
- L380: round two: the coordinator had asked for proof that a new switch assertion fails under a bare `&&`, which was impossible because shared `setup()` awaits section text; the agent restructured the test setup first.
- Cost: test setup had to be restructured in the second round (an 8-minute round) before the regression could even be asserted; without the agent's own test the admin page would have shipped with no way to re-enable MCP.

## Root cause
`SettingsSection` wraps its entire body, `title` and `description` included, in `{children && (<Stack>...)}`. Callers that put a control in `title` (here the MCP on/off `Switch`) lose it whenever children are falsy. Nothing in the props or docstring says the header depends on children.

## Why agents fall for it
`cond && (<Section/>)` is the idiomatic React way to hide optional content, and the page's other sections were already hidden that way. The header looks like independent chrome of the card. The empty-fragment idiom that avoids it lives in an unrelated file (`ToggleSettingsSection` in AISettingsPage.tsx) with no comment explaining why.

## Current state
Checked origin/master: `SettingsSection.tsx` still renders `{children && (<Stack ...> {(title || description) && ...} {children} </Stack>)}`; `McpAppsSettings.tsx` uses `isEnabled ? (<Stack>...</Stack>) : (<></>)`.

## Suggested fix
- Render the title/description block regardless of `children` in `SettingsSection` (hide only the body), or add an explicit `hideWhenEmpty` prop.
- Until then, document the behaviour on the component and add a unit test that a section with a title and no children still renders its title.

## Detection signal
JSX `{flag && (` as the child of `<SettingsSection` whose `title` contains a `Switch` or other control; `<></>` passed as children; admin spec setup timeouts waiting for section text.
