---
title: The `documents/comments.cy.spec.ts` e2e spec failed intermittently on master and on unrelated PRs in three different ways and was not quarantined, so each hit hard-failed e2e-group-35 and agents spent reruns and log triage proving it was not their change
slug: document-comments-hover-reveal-click-flake
kind: test-harness
impact: wasted-time
severity: medium
status: fixed # master got 'Stabilize document comment tests' on 2026-09-15
area: `e2e/test/scenarios/documents/comments.cy.spec.ts`, e2e-group-35-ee job, CI Conductor quarantine gate
merged_from: documents-comments-e2e-spec-flaky, e2e-document-comments-spec-flaky
occurrences:
  - transcript: ~/.claude/projects/-Users-andrei-src-mb/17ced372-740e-4ab7-a0be-3ea30f2f9a1c.jsonl
    lines: 597-749
    date: 2026-09-07
    jev: {any_papercut: 0.94, env_toolchain: 0.89, stale_state: 0.50, verify_mismatch: 0.64, misleading_code: 0.21, hidden_coupling: 0.26, stale_docs: 0.28, tool_footgun: 0.94, flaky: 0.98, agent_bug: 0.37, wasted_effort: 0.85, user_correction: 0.43}
---
## Summary
In one CI sweep the same spec failed on two unrelated PRs and on plain master: a Chrome renderer crash, a `cy.click()` on an invisible element in 'allows to create / update / delete comments', and on the fourth attempt a different test ('supports mentions and can mention yourself'). It was not on the quarantine list, so the gate failed the job every time. One PR needed three runs to go green; the other failed four times before the agent stopped rerunning.

## Symptom
- Chunk .0 L114-L115: `documents/comments.cy.spec.ts ... We detected that the Custom Chrome for Testing Renderer process just crashed.`
- L597-L598: on rerun, `NOT quarantined ... document comments > allows to create / update / delete comments`.
- L691: `CypressError: Timed out retrying after 4050ms: cy.click() failed because this element is not visible`.
- L696: the same test failed on master at 15:37 the same day.
- L743: attempt 4 fails a different test in the same spec.

## Timeline
- Chunk .0 L101-L134: first failures on two PRs (renderer crash, quarantine gate).
- L402: called flakes, reruns started.
- L597-L603: failures reproduce on rerun; the agent withdraws its flake call.
- L624-L634: lists master runs; the same jobs fail on master.
- L689-L700: third failure on one PR; master failed the same test earlier.
- L727-L749: attempt 4 fails on another test; agent stops at four attempts.
- Cost: 7 CI attempts across two PRs, about 20 tool calls of log triage, and one PR left red at the end of the sweep.

## Root cause
Not known in detail. The failure modes varied (renderer crash, visibility timeout, a different test failing on the next run), which points at an unstable spec rather than one bug. Other master-level flakes in the same sweep (Snowflake driver tests seeing tables from concurrent runs in a shared account, a Postgres app-db test) made 'is it my change?' harder to answer.

## Why agents fall for it
A failure in a spec the PR does not touch is usually a flake, but calling it one without evidence is a guess; proving it took listing master runs and reading four logs. Without quarantine, the gate's verdict looks the same for a flake and a regression.

## Current state
Checked origin/master: commit 'Stabilize document comment tests' (2026-09-15) touches `e2e/test/scenarios/documents/comments.cy.spec.ts`. Not checked whether the quarantine list changed.

## Suggested fix
- Auto-quarantine a test after N non-quarantined failures on master within a window, so PR gates stop failing on it.
- Have the quarantine gate print whether the same test failed on master recently, the check the agent did by hand.

## Detection signal
`NOT quarantined` verdicts for the same test across unrelated PRs and master within a day; `Renderer process just crashed` in e2e logs.

## Raw excerpts
```
L115 [RESULT] (chunk .0) ...Z   Running:  documents/comments.cy.spec.ts   (1 of 9) | ...Z   document comments | ...Z We detected that the Custom Chrome for Testing Renderer process just crashed. | ...Z We have failed the current spec but will continue running the next spec.
L598 [RESULT] ######## rerun: pg ######## | ... FAIL in metabase.setup-rest.api-test/create-superuser-test ... | ######## rerun: e2e35 ######## | ... NOT quarantined  document comments > allows to create / update / delete comments
L691 [RESULT] job 101836965690 | ...Z   Running:  comments.cy.spec.ts   (1 of 1) | ...Z      CypressError: Timed out retrying after 4050ms: `cy.click()` failed because this element is not visible: | ...Z [ci-conductor]   NOT quarantined  document comments > allows to create / update / delete comments
L696 [RESULT] 2026-09-07T15:37:29.7410567Z [ci-conductor]   NOT quarantined  document comments > allows to create / update / delete comments | ... VERDICT: FAIL - 1 of 1 failure(s) are NOT quarantined.
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/8c776c72-ae8d-4ded-9d94-9661894ad0b6.jsonl
  lines: 1147-1881
  date: 2026-09-04
  jev: {any_papercut: 0.64, env_toolchain: 0.14, stale_state: 0.19, verify_mismatch: 0.92, misleading_code: 0.20, hidden_coupling: 0.53, stale_docs: 0.35, tool_footgun: 0.37, flaky: 0.68, agent_bug: 0.74, wasted_effort: 0.69, user_correction: 0.74}

- L1152/L1156: `e2e-group-35-ee` fail; log shows `cy.click()` failed because the element is not visible after a 4s retry.
- L1861/L1871: same group, same spec file, a different test, five days later.

- L1147-L1174: first occurrence on a backend PR; the agent confirms the diff has no frontend path and that the spec has recent flake fixes; recommends rerun.
- L1744-L1795: a different e2e flake (collection picker timeout) and an FE unit flake on two other PRs; reruns and auto-merge.
- L1855-L1881: document comments flake again on a two-file PR; rerun proposed.
- Cost: about 12 tool calls of log triage and two 12-minute e2e reruns delaying merges.

```
L1151 [CALL] Bash: cd ~/src/mb/metabase && gh pr checks 81944 2>&1 | grep -viE "\bpass\b|skipping" | head -40
L1152 [RESULT] e2e-tests / e2e-group-35-ee / e2e-tests-e2e-group-35-ee	fail	12m12s	... | e2e-tests / e2e-tests-result	fail	5s ...
L1170 [RESULT] 6d2c060ef14 Fix flaky document-comment split test (#77391) | 5f8ff144924 ... [Flaky Test]: should render saved top level blocks (#80614) | ... --- our diff touches FE? | src/metabase/search/appdb/index.clj ...
L1871 [RESULT] ... 1 failing | ... 1) document comments
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/ea892f4f-4e3c-479f-b370-880a3afe35e8.jsonl
  lines: 2016-2034
  date: 2026-09-03
  jev: {any_papercut: 0.82, env_toolchain: 0.88, stale_state: 0.29, verify_mismatch: 0.35, misleading_code: 0.22, hidden_coupling: 0.27, stale_docs: 0.26, tool_footgun: 0.52, flaky: 0.91, agent_bug: 0.21, wasted_effort: 0.26, user_correction: 0.07}

L2016: the diagnosis finds `document comments > allows to create / update / delete comments` failing with `CypressError: … cy.click() failed because this element is not visible` on `comment-action-panel-more-actions`, which is hidden by `visibility: hidden` on its parent; L2034: the same test broke all three PRs.

- Main L1954: diagnosis subagent launched over five red PRs (about 16 minutes).
- L2016: three PRs share this Cypress failure; master green on recent runs.
- L2019-L2031: failed jobs rerun on all three PRs.
- L2034: the agent flags it as a top flake worth quarantining.
- Cost: three CI reruns and a long diagnosis pass; the same flake hit another session the day before.

```
L2019 [CALL Bash] cd ~/src/mb/metabase && for r in <run>:<pr> <run>:<pr> <run>:<pr>; do … gh run rerun "$run" --repo metabase/metabase --failed 2>&1 | tail -1 ⏎ done
```

## Additional occurrence
- transcript: ~/.claude/projects/-Users-andrei-src-mb/9a88b72e-3629-4bc8-8ad6-2e2604ad3d18.jsonl
  lines: 205-311
  date: 2026-09-02
  jev: {any_papercut: 0.71, env_toolchain: 0.48, stale_state: 0.25, verify_mismatch: 0.68, misleading_code: 0.18, hidden_coupling: 0.26, stale_docs: 0.31, tool_footgun: 0.60, flaky: 0.88, agent_bug: 0.41, wasted_effort: 0.31, user_correction: 0.08}

L311: the agent pins it to `documents/comments.cy.spec.ts`, "allows to create / update / delete comments": `cy.click()` on the hover-revealed comment action panel, whose parent has `visibility: hidden`; the file has a history of flake fixes.

- L205-L206: two red jobs on the PR.
- L215-L234: log download and parsing; spec and test identified.
- L256-L275: spec history (earlier deflake commits), component test id and the CSS that hides the panel.
- L289-L294: master green on group-35-ee at two commits.
- L298-L318: rerun, green after about 12 minutes.
- Cost: about 12 calls and a CI rerun.

```
L266 [CALL Bash] cd ~/src/mb/wt/<branch> && grep -rn "comment-action-panel-more-actions" --include='*.tsx' frontend/src enterprise/frontend 2>/dev/null | head -3
L267 [RESULT] frontend/src/metabase/comments/components/Discussion/DiscussionActionPanel.tsx:117:                  data-testid="comment-action-panel-more-actions"
L275 [RESULT] … .actionPanel { ⏎   position: absolute; ⏎   top: -8px; ⏎   right: 0; ⏎   z-index: 1; ⏎   border: 1px solid var(--mb-color-border-neutral); ⏎   visibility: hidden; ⏎ ⏎   .commentRoot:hover & { ⏎     visibility: visible; ⏎   } ⏎ }
L294 [RESULT] === ae10677d61a ⏎ {"skipped":29,"success":71} ⏎ e2e-tests / e2e-group-35-ee / e2e-tests-e2e-group-35-ee success ⏎ === 5885d30ad06 ⏎ {"skipped":9,"success":91} ⏎ e2e-tests / e2e-group-35-ee / e2e-tests-e2e-group-35-ee success
```
