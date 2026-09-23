# Papercut mining: Claude run vs Codex run, and a merged format

Written 2026-09-23. It compares the two collections in `hackathon-2026-papercut/slop/chris/papercuts/` (`claude/` and `codex/`):

- `chris.claude.*`: 118 cases from this run.
- `chris.codex.*`: 16 cases plus a negative-control file, from the Codex run.

It then proposes one format and one pipeline that keep the strengths of both.

## Bottom line

- **Each run found things the other missed.**
  - Codex found sharper **code** papercuts: subtle wrong output traced to a data contract.
  - Claude found the long tail of **tooling, environment and agent-habit** papercuts, and counted how often each recurs.
  - For the same session, each run surfaced a different papercut from the other. The sets are complements, not duplicates.
- **The best format** has three parts:
  - Codex's short, claim-first prose body, with clickable line links and an explicit verdict.
  - Claude's machine-readable frontmatter, with occurrences, recurrence, current-state check and detection signal.
  - Three new fields: **owner**, **outcome** and **evidence strength**.
  - Negative controls live in the same schema as labelled non-cases.
- **The best pipeline** screens twice: Codex-style at session level, then Claude-style at chunk level with several questions. A single consolidation pass (dedupe by mechanism) runs before anything is written. Parallel writers into one flat directory were the main source of mess.

## What each run produced

| | Codex run | Claude run |
|---|---|---|
| Sources screened | 696 interactive sessions (449 Codex, 247 Claude). About 5,800 files enumerated, most of them automated sessions | 674 Claude files (272 sessions plus 402 subagent runs) → 941 chunks after the embargo filter |
| Jev use | 1 noul per **session**, over selected, redacted human and assistant turns. 12 sessions ≥0.8, 179 at 0.5–0.8 | 7 nouls per **60k-char chunk**, over user, assistant, tool and result lines. The rank weights the more specific questions |
| Selection for deep reading | Scores plus correction/failure heuristics plus manual reading. Several real cases scored <0.5 | The top 110 chunks by weighted score, read by 11 parallel agents |
| Cases | 16 plus negative controls | 118 (after merging 5 duplicate pairs) |
| Case size | 1.3–4 KB, prose | 2–20 KB, frontmatter plus 9 sections plus raw excerpts |
| Mix | Mostly code/contract traps and near-misses | 28 tool quirks, 27 codebase traps, 21 agent-behaviour, 15 misleading signals, 13 env friction, 10 test harness, 4 doc gaps |
| Recurrence | One case per incident | Occurrences merged per mechanism. The worst ones: zsh/BSD shell 19+, `git add -A` sweeping 8, `--no-verify` reflex 4+ |
| Current-state check | Deliberately none ("cases describe historical states") | Checked against the checkout with `file:line`. 64 open, 27 documented-but-still-hit, 16 fixed |
| Negative controls | Yes, a dedicated file | Only as a false-positive list in `pipeline/calibration.claude.md` |
| Machine-readable data | `papercuts/codex/chris.codex.jev-screen.jsonl` (path, noul, selected lines) | `pipeline/output/scores.jsonl` (7 scores per chunk), frontmatter in every case |

### Overlap

Five Codex cases cite Claude sessions that the Claude run also drilled into. In most of them the two runs pulled out *different* papercuts from the same session:

| Session | Codex case | Claude cases from the same session |
|---|---|---|
| `025e8586` | cluster-lock-transaction: an `in-transaction?` guard is a near-miss, because the cluster lock makes it true only on PG/MySQL | search-temp-index-ddl…, local-test-appdb-differs-per-worktree-lein-env, driver-gated-tests-silently-skip-locally. **Claude missed the cluster-lock guard facet.** |
| `a42e9e59` | kondo-cache: a cache-dependent hook was silent in CI | user-http-request-named-like-real-http, dynamic-redefs-proxy…, false-why-comments…, parallel-subagents-share-scratchpad. **Claude missed the kondo cache case**, probably because it is the session's *opening premise* rather than a mid-session stumble |
| `44d740f8` | merge-preview-compile: a namespace move passed locally but broke the merge preview | comments-dropped-when-moving-code, lein-env-cat-leaks-secrets. **Claude missed the merge-preview case** |
| evals sessions | eval-archive-schema, test-path | The Claude run appended to eval-archive-schema and missed test-path |

Coverage the Claude run could never have had: 9 Codex cases come from `~/.codex/sessions`, for example nested-field-paths, mallidoc-validation, semantic-setting and loading-state-type.

Coverage the Codex run missed: most of the 118. Some examples:

- **Shell and harness:** the zsh `$PATH` clobber, the ugrep shim.
- **Test harness traps:** the FATAL-only test console, driver-gated tests passing with 0 assertions, `test-agent :only` running namespaces CI never discovers.
- **Git and stacked branches:** the git-spice stale base hash dropping 17 commits.
- **Test-harness naming:** the `mt/user-http-request` naming trap (22 false suppression comments).
- **Agent habits:** every agent-behaviour pattern.

Codex's session-level screen reads mostly human turns. So it sees what the *user* noticed and corrected, and misses what only shows in tool output, which is where most misleading-signal and env-friction cases live.

## Strengths worth keeping

**From Codex**

- **Claim-first titles and a one-line verdict.** For example: "Classification: review-detected near miss rather than a confirmed production loss". The reader gets severity and certainty in one line.
- **Clickable evidence.** `[line 427](…jsonl#L427)` links sit inline in the prose, next to the claim they support. Claude's timeline cites `L2051` as plain text.
- **Careful epistemics.** The notes separate "the user reports" from "the transcript verifies". They mark near-miss vs shipped regression. They say a recorded fix is "evidence of work, not a fresh assertion". The Claude cases sometimes state agent-reported facts as verified.
- **Negative controls.** Labelled non-cases are required for testing a classifier. The Claude run has only an informal false-positive list.
- **Brevity.** A 2 KB case is readable in the index-to-case loop. Several Claude cases run past 10 KB, and the raw-excerpt sections repeat the timeline.

**From Claude**

- **Frontmatter a tool can consume.** kind, impact, severity, status, area, and occurrences with transcript, lines, date and Jev scores. The index is generated from it.
- **Recurrence as a first-class number.** Merging occurrences by mechanism turned "a zsh glob failed once" into "19 occurrences across 10+ sessions, some producing false audit results". Recurrence is the strongest priority signal.
- **Current-state verification.** "Still at `test/metabase/test/util.clj:978-1016`" is what makes a case actionable. It also found stale memory notes that claimed a fix, like the kondo ratchet scanner.
- **`documented-still-hit` status.** 27 cases hit a trap that a memory note already described. That tells us notes alone don't stop the behaviour; these need hooks, lints or code changes.
- **Detection signal and suggested fix.** These are what the papercut tool will be built from.
- **Tool-output visibility.** Chunk-level classification over tool calls and results catches silent-failure and misleading-output cases that human turns never mention.

## Weaknesses to avoid

- **Codex:**
  - No structured fields, so there's no index by kind or severity, and no recurrence count.
  - One incident per case, so repeated traps look like one-offs.
  - No current-state check, so the reader can't tell if a case is still actionable.
  - The single noul per session mixes every failure type into one probability; several verified cases scored <0.5.
- **Claude:**
  - The cases are verbose.
  - Parallel writers produced 5 duplicate pairs and a frontmatter-less stray, and their cross-references then pointed at deleted slugs.
  - Agents also appended to two `chris.codex.*` files (`ci-repository-default`, `eval-archive-schema`). That crossed collections.
  - Two of the seven questions (`tool_misuse`, `env_friction`) flag almost everything.
  - `user_correction` fires on style and voice feedback.
  - Only the top 110 of 914 chunks were read.
- **Both:**
  - Neither records **who owns the fix** (repo code, repo tooling, personal `~/bin` and dotfiles, a third-party CLI, the agent harness, or agent behaviour). That decides where the fix goes.
  - Neither tags **which agent** hit it (Claude, Codex, a subagent, a review bot).

## Synthesized case format

One file per **mechanism**, not per incident. Frontmatter holds everything a tool filters or sorts on. The body is short prose in the Codex style, capped at about 400 words, with inline line links. Long excerpts go into an optional collapsed appendix.

```markdown
---
slug: test-console-fatal-hides-warnings
title: Test stdout is FATAL-only, so "no warning in the output" looks like proof a warn path never ran
label: papercut            # papercut | not-papercut (negative control) | agent-habit
mechanism: misleading-signal   # codebase-trap | test-harness | misleading-signal | doc-gap | tool-quirk | env-friction | agent-behaviour
owner: repo-tooling        # repo-code | repo-tooling | personal-tooling | third-party-cli | harness | agent
area: test_config/log4j2-test.xml; ./bin/test-agent
outcome: false-conclusion  # shipped-bug | near-miss | false-conclusion | wasted-time | data-loss
severity: high             # high | medium | low (use cost × likelihood of recurrence)
evidence: transcript-verified   # transcript-verified | source-verified | user-asserted | inferred
status:
  state: partly-fixed      # open | partly-fixed | fixed | documented-still-hit | unknown
  checked: 2026-09-23 @ bf3d250f132
  where: test_config/log4j2-test.xml:7 (FATAL console), :12 (WarnConsole for app-db.connection only)
  documented_in: []        # CLAUDE.md / skill / memory paths that already describe it
occurrences:
  - transcript: ~/.claude/projects/…/31b066ea-….jsonl
    lines: [2046, 2308]
    date: 2026-08-25
    agent: claude          # claude | claude-subagent | codex | review-bot
    screen: {jev_session: 0.83, jev_chunk: {misleading_signal: 0.87, codebase_trap: 0.92}}
recurrence: 1              # len(occurrences); the index sorts by severity × recurrence
detection:
  transcript_signal: grep of test output for a log string returns 0, followed by "path isn't firing"
  prevention: test-agent footer naming logs/test-log.json and its WARN/ERROR counts; CLAUDE.md note
related: [search-temp-index-ddl-commits-enclosing-with-temp]
---
**Verdict:** confirmed misleading signal. It cost hours and discarded a correct hypothesis.

**Observed.** The agent grepped test output for the rollback warning and got 0 hits
([L2051](…#L2051)). It concluded that the DDL path wasn't firing ([L2061](…#L2061)). A subagent later
proved the path fired on every run ([L2219](…#L2219)).

**Mechanism.** The Console appender has `ThresholdFilter level="FATAL"`. Warnings go only to
`logs/test-log.json`, which is overwritten on every run, and nothing on screen points to it.

**Why it traps agents.** Grepping output for a log line is the normal way to check that a path ran.
Here it gives a guaranteed false negative.

**Fix.** …   **Current state.** …

<details><summary>Excerpts</summary>

…verbatim, redacted, ≤40 lines…
</details>
```

Rules that go with the format:

1. **Negative controls use the same schema** with `label: not-papercut` and a one-line reason. Promote Claude's false-positive list (`pipeline/calibration.claude.md`) and Codex's `negative-controls.md` into individual files, so the classifier test set is `label` × transcript range.
2. **`evidence` is mandatory.** A case built only on what the agent or user said stays `user-asserted` until someone checks the code or rereads the transcript.
3. **Separate history from now.** `occurrences` is history. `status` is dated and pinned to a commit. The body never mixes the two in one sentence.
4. **Recurrence beats prose.** When a new incident matches an existing mechanism, add it as an occurrence line. Don't write a new file or an "Additional occurrence" essay.
5. **One writer per file, one namespace per run.** Write drafts to `drafts/<run>/`. Only the consolidation step writes `chris.<agent>.*`. Never edit the other run's namespace; propose a merge instead.

## Synthesized pipeline

1. **Enumerate every transcript store.** That means Claude projects including subagents, Codex sessions, and anything else found (the Codex run also checked OpenCode, Cursor, Copilot and Aider). Snapshot or copy the list first, because transcripts get deleted: two Claude sessions disappeared mid-run.
2. **Render and redact locally** with `pipeline/prep.py` (tool calls and results included), and filter embargoed work.
3. **Session screen (Codex style).** One cheap noul per session over the human turns: "Did the user have to correct or rescue the agent?" This catches what the user noticed.
4. **Chunk screen (Claude style), with sharper questions.**
   - Keep `self_inflicted_bug`, `misleading_signal` and `codebase_trap`.
   - Replace `tool_misuse`/`env_friction` with "the failure was caused by the tool's interface or environment, not a typo".
   - Split `user_correction` into factual vs preference.
   - Add `owner` as a Choice.
   - Relax `flailing` (it almost never fired above 0.8).
5. **Union the two screens.** Codex found real cases below 0.5, so sample some of the mid band as well as the top.
6. **Drill down into drafts.** Each agent writes drafts in the new schema to its own `drafts/<batch>/` folder, with no shared directory.
7. **Consolidate once.** A single agent clusters drafts by mechanism, merges occurrences, checks current state against one pinned commit, sets `evidence`, and writes final files plus a generated index sorted by severity × recurrence. It also emits `negatives.jsonl` for classifier testing.
8. **Scan for secrets** over the output before anything is shared.

## Operational notes from this run

- Auto mode blocked sending transcripts to `api.typesafe.ai`, and also the purely local filter step, as data exfiltration. The user had to run `filter.py` and `classify.py` with `!`. Plan for that, or add a narrow allow rule.
- 27 chunks got HTTP 403 HTML from the API, which looks like a web firewall. 18 of them are one kondo-ratchets workflow's subagents, so a content pattern is the likely trigger. Retry with smaller chunks or look for the pattern.
- The environment trap in the corpus hit this very comparison: `echo ======` failed with `(eval):1: ===== not found` while I was comparing the files. That's a good smoke test for any detector of the zsh case.
- Cost is not the constraint. Jev over the full Claude corpus was about $0.53. The drill-down agents (about 3.5M subagent tokens) cost far more, so spend screening effort to cut drill-down volume, not the other way round.
