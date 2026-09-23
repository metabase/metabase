---
title: The coordinating agent relayed subagents' unverified findings to the user as ready-to-file tickets; two of three were factually wrong and had already been written into a doc and PR text
slug: asserts-unverified-claims-as-fact
kind: agent-behaviour
impact: wasted-time
severity: medium
status: open
area: multi-agent orchestration; follow-up ticket drafts; docs and PR descriptions written by subagents
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/68ee270d-d566-49b6-92ca-ded939295501.jsonl
    lines: 565-668
    date: 2026-08-27
    jev: {any_papercut: 0.81, env_toolchain: 0.16, stale_state: 0.30, verify_mismatch: 0.40, misleading_code: 0.48, hidden_coupling: 0.84, stale_docs: 0.53, tool_footgun: 0.29, flaky: 0.83, agent_bug: 0.94, wasted_effort: 0.39, user_correction: 0.41}
---
## Summary
After a batch of ticket fixes, the coordinator offered the user three follow-up tickets as facts (an Agent API enum "missing boxplot, treemap, sunburst, object", a sunburst "phantom" that "cannot render", and a flaky test). The user approved filing them on condition that each claim was verified first. An adversarial verification agent found that sunburst is not a display type (so the Agent API is right to reject it) and that an unknown display renders as a table rather than failing. Two of the three claims had factual errors, and the implementing agent had to be sent back to correct its doc and PR text.

## Symptom
L565: the tickets presented for a yes or no on each, with the wrong details stated as fact. L572: the user asks for an independent check that each issue is real. L634: the coordinator reports that two of its three claims had factual errors and corrects them.

## Timeline
- L565: three follow-ups offered with unverified details.
- L572: user approves, conditional on verification.
- L578-L583: verification agent briefed to treat REFUTED and UNPROVEN as good outcomes.
- L623-L634: two of three claims corrected (about 14 minutes of agent time).
- L640-L668: tickets filed with corrected text; a correction round sent to the implementing agent for its doc and PR description.
- Cost: a verification agent run and a doc and PR-text correction round.

## Root cause
Subagent reports mix verified results with inferences; the coordinator summarised both at the same confidence and turned them into ticket proposals without re-checking. The underlying wrong claims came from a grep-only existence check and an assumption about how the frontend handles unknown displays (see unknown-card-display-falls-back-to-table).

## Why agents fall for it
A subagent's report reads as authoritative, and a coordinator batching many results optimises for a crisp summary. Nothing in the workflow requires a verification pass before a claim becomes a ticket draft.

## Current state
Not checked (workflow behaviour).

## Suggested fix
- In the orchestration brief: any claim that becomes a ticket, PR text or doc statement needs an independent verification pass against clean master first, with REFUTED and UNPROVEN as acceptable outcomes (the pass used here worked).
- Have subagent reports tag each claim as run, read, or inferred, and carry the tag into the coordinator's summary.

## Detection signal
Coordinator messages proposing tickets built from subagent findings with no verification step; user requests to double-check that claims are real; later corrections of the same claims in docs or PR text.

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/dcbc556d-c81c-4160-af67-238040132220.jsonl
  lines: 1762-2023
  date: 2026-09-11
  jev: {any_papercut: 0.80, env_toolchain: 0.64, stale_state: 0.21, verify_mismatch: 0.86, misleading_code: 0.21, hidden_coupling: 0.59, stale_docs: 0.40, tool_footgun: 0.82, flaky: 0.81, agent_bug: 0.95, wasted_effort: 0.84, user_correction: 0.93}

L1774: the agent states that GitHub has no stacked-PR feature and that only third-party tools add one. L1778: the user disputes it. L1804: a web search shows GitHub shipped native stacked PRs on 2026-07-30. L2005: the base PR has auto-merge enabled, and GitHub will not stack a PR with auto-merge on, which is why no stacking banner appeared.

- 09:40:30 L1762 user asks about the missing stacking prompt.
- 09:40:42 L1774 unverified claim that the feature does not exist.
- 09:42:20 L1778 user correction; L1790-L1804 web search confirms the launch.
- L1805-L1820 reads the docs; the `gh stack` extension exists.
- 09:49:52 L2005 finds auto-merge on the base PR blocks stacking; disables it.
- 09:50:15 L2023 stack created.
- Cost: a wrong answer the user had to catch, and about ten minutes to reach the real cause.

```
L1797 [RESULT] Web search results for query: "GitHub stacked pull requests public preview 2026"  Links: [{"title":"Stacked pull requests are now in public preview - GitHub Changelog","url":"https://github.blog/changelog/2026-07-30-stacked-pull-requests-are-now-in-public-preview/"} ...
```
