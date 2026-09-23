# Papercut case schema

Proposed format for the next papercut collection, as of 2026-09-23.

It builds on the two learnings reports: [Claude](learnings.report.claude.md) and [Codex](learnings.report.codex.md). It also fits the server changes proposed in the two server reviews: [Claude](schema.server.claude.md) and [Codex](schema.server.codex.md).

The existing `chris.claude.*` and `chris.codex.*` files stay as source artifacts. This schema is for the canonical cases built from them and for new mining runs.

## Principles

1. **One case per mechanism, not per incident.**
   - Each incident is an *occurrence* inside its case.
   - Recurrence is `len(occurrences)`.
   - Split a case when its fixes or owners differ.
2. **Metadata for tools, prose for people.**
   - Frontmatter holds everything an index, importer or classifier filters on.
   - The body is short enough to verify the judgment without replaying the transcript.
3. **Evidence is typed.**
   - A user's diagnosis, an agent's theory, tool output, a source check and a reproduction are different kinds of evidence.
   - The case records which kind supports each step.
4. **History and now are separate.**
   - Occurrences are history.
   - `status` describes the present and must carry a date and a revision.
5. **Screening scores are a queue, not a label.**
   - Jev probabilities live in the screening ledger.
   - A case at most points at them.
6. **Negatives use the same schema.**
   - Hard negatives and ambiguous cases carry `label: negative` or `label: ambiguous`.
   - Together with the positives they form the classifier evaluation set.

## Files

- **Location:** `papercuts/cases/<slug>.md`, one canonical case per file.
  - The slug is the case's identity.
  - The server fingerprint is derived from it: `papercut:<slug>`.
  - Don't rename a slug once imported. When cases merge, record the old slugs in `aliases`.
- **Drafts:** a mining run writes drafts to `papercuts/drafts/<run-id>/`, with one writer per folder.
  - Only the consolidation step writes `cases/`.
  - A run never edits another run's drafts.
- **Source artifacts:** the existing `papercuts/claude/` and `papercuts/codex/` folders stay unchanged.
  - Cases refer back to them via `sources`.

## Frontmatter

### Fields

| Field | Type | Req. | Values / meaning |
|---|---|---|---|
| `slug` | string | yes | kebab-case, stable; equals the filename |
| `title` | string | yes | ≤ 90 chars, a claim: "X does Y, so agents Z" |
| `label` | enum | yes | `positive` \| `negative` \| `ambiguous` |
| `scope` | enum | yes | `core` (an environmental cause trips the agent) \| `adjacent` (a recurring agent habit with no shown environmental cause) |
| `kind` | enum | yes | see [kind](#kind) |
| `owner` | enum | yes | see [owner](#owner): who has to change something to fix it |
| `area` | list of strings | yes | repo paths, tool names or systems; the first entry is the primary one |
| `outcome` | list of enums | yes | see [outcome](#outcome); several may apply |
| `severity` | enum | yes | `high` \| `medium` \| `low`: cost of one hit × chance it recurs |
| `verification` | enum | yes | the highest level reached; see [verification](#verification) |
| `status` | object | yes | see [status](#status) |
| `occurrences` | list | yes | ≥ 1 for `positive` and `ambiguous`; see [occurrence](#occurrence) |
| `affordance` | string | if `core` | the specific thing that misleads: a name, default, silent exit code, missing signal or stale doc |
| `detection` | object | no | `transcript_signal`, `prevention` (lint / hook / test / doc / code), `probe` (a minimal reproduction command or test) |
| `aliases` | list of slugs | no | old slugs merged into this case; the importer registers each as an extra fingerprint |
| `related` | list of slugs | no | distinct mechanisms that co-occur, with no merged counts |
| `sources` | list of paths | no | source write-ups the case was built from, such as `papercuts/claude/chris.claude.<slug>.md` |
| `negative_reason` | string | if `negative` | why this is not a papercut, e.g. "style preference" or "bug caught by the agent's own test; no misleading contract" |
| `open_question` | string | if `ambiguous` | the evidence that would settle it |

### Enums

#### kind

The failure mechanism, meaning *how* the agent was misled.

| Value | Meaning |
|---|---|
| `codebase-trap` | Code whose names, defaults, side effects or invariants invite the wrong change |
| `test-harness` | Test infrastructure that runs, skips or isolates tests differently from what an agent assumes |
| `misleading-signal` | Output that is wrong or incomplete: success on failure, a silent skip, a filtered log, a stale cache, a misdirecting error |
| `doc-gap` | Docs, skills, CLAUDE.md or memory that are missing, wrong or stale |
| `tool-quirk` | A CLI or script whose interface or defaults surprise the caller |
| `env-friction` | Shell, worktree, sandbox, database, daemon or dependency state |
| `agent-behaviour` | A recurring agent habit. Always `scope: adjacent` unless `affordance` names an environmental cause |

#### owner

Where the fix would go.

| Value | Examples |
|---|---|
| `repo-code` | `src/`, `test/` in the product repo |
| `repo-tooling` | `bin/`, `mage/`, `.clj-kondo/`, CI config, test config |
| `personal-tooling` | `~/bin`, dotfiles, personal skills and memory |
| `third-party` | git, gh, git-spice, roborev, linear CLI, codex, a library |
| `harness` | The agent harness: the Bash tool's shell, edit hooks, subagent isolation, permissions |
| `agent-practice` | Prompts, skills or hooks that shape agent behaviour |

#### outcome

What the trap cost. List every value that applies.

| Value | Meaning |
|---|---|
| `shipped-bug` | A wrong change was pushed or merged |
| `introduced-bug` | A wrong change was made and caught before it was pushed |
| `near-miss` | A wrong change was proposed and rejected |
| `false-conclusion` | The agent or user believed something untrue, such as "not reproducible" or "pre-existing" |
| `wasted-time` | Effort spent on detours or rework |
| `data-loss` | Work, data or edits were destroyed |

#### verification

| Value | Meaning |
|---|---|
| `unverified` | Built from a summary or a score only |
| `transcript` | The decisive transcript lines have been read |
| `source-reviewed` | The mechanism has been confirmed in code, config or tool docs |
| `reproduced` | The trap has been triggered deliberately |

### status

```yaml
status:
  state: open          # open | partly-fixed | fixed | wontfix | unknown
  checked_at: 2026-09-23
  revision: bf3d250f132 # commit, tool version, or null when not checked
  where: test_config/log4j2-test.xml:7   # file:line or version that shows the state
  documented_in: [~/.claude/.../memory/reference_x.md]   # places that already describe the trap
```

- **Unchecked status:** if `revision` is null, `state` must be `unknown`.
- **"Documented but still hit":** this is no longer a status value. It is derived: `documented_in` is non-empty and at least one occurrence has `docs_existed: true`.

### occurrence

```yaml
occurrences:
  - provider: claude          # claude | codex | other
    actor: subagent           # main | subagent | review-bot | user
    session: 31b066ea-d480-4a3f-a6f1-0bc74a18367f
    transcript: ~/.claude/projects/<project>/<session>.jsonl   # absolute or ~-relative
    transcript_available: true   # false once the file is deleted; anchors then cite the redacted copy
    date: 2026-08-25          # ISO date; approximate dates are written as a range
    outcome: [false-conclusion, wasted-time]   # this occurrence's cost, a subset of the case outcome
    docs_existed: false       # true | false | unknown: was the trap documented when this hit
    screen:                   # optional pointer into the screening ledger, not a label
      ledger: pipeline/output/scores.jsonl
      scores: {misleading_signal: 0.87, codebase_trap: 0.92}
    anchors:                  # 2-5 decisive lines, each saying what it proves
      - line: 2051
        role: tool-output     # user | agent | tool-output | source-check | reproduction
        proves: grep of test output for the warning returned 0
      - line: 2061
        role: agent
        proves: agent concluded the code path never ran
      - line: 2219
        role: reproduction
        proves: println at the same catch showed the path fired every run
```

- **Anchor identity:** each anchor's `(transcript, line)` must be unique within a case.
- **Occurrence identity:** an occurrence is identified by `(session, first anchor line)`. The importer builds the stable server `report_id` from this.

## Body

Order the sections as below. Keep the total to about 400 words or less, not counting `Excerpts`.

| Section | Req. | Content |
|---|---|---|
| **Verdict** | yes | One line: label, kind, outcome, and how sure. For example: "Confirmed misleading signal; hours lost and a correct hypothesis dropped." |
| **Trap** | yes | Two sentences: what misleads, and what that causes |
| **Observed** | yes | Numbered steps, each with an inline transcript link `[L2051](…jsonl#L2051)`. For several occurrences, describe the clearest one and summarise the others in one line each |
| **Mechanism** | yes (positive) | The cause, kept separate from the symptom. Name the affordance |
| **Evidence and limits** | yes | Which step rests on which evidence type, and what the case does *not* claim |
| **Current state** | yes | Restate `status` in prose, with `file:line` |
| **Fix candidate** | no | Marked as a proposal until it is implemented |
| **Detection** | no | How a tracker would spot it in a transcript, and how to prevent it |
| **Excerpts** | no | Inside `<details>`, verbatim and redacted, ≤ 40 lines |

Negative cases need only **Verdict**, **Observed** and **Why not a papercut**.

## Validation rules

A consolidation script should reject a case that breaks any of these rules:

1. `slug` equals the filename stem, and no slug or alias appears in more than one case.
2. `label: negative` ⇒ `negative_reason` is set and `occurrences` has anchors.
3. `label: ambiguous` ⇒ `open_question` is set.
4. `scope: core` ⇒ `affordance` is set.
5. `kind: agent-behaviour` ∧ no `affordance` ⇒ `scope: adjacent`.
6. `status.revision: null` ⇒ `status.state: unknown`.
7. `verification ≥ source-reviewed` ⇒ `status.where` is set.
8. Every occurrence has ≥ 1 anchor. `verification ≥ transcript` ⇒ every occurrence has ≥ 2 anchors.
9. The case `outcome` is the union of all occurrence outcomes.
10. The file must pass a secrets scan: no tokens, keys, credentials or env var values.

## Server mapping

`import_local.py` turns each occurrence into one report. With the server changes proposed in the reviews (a raw `payload` on each report, and fingerprint and category stored per report):

| Report field | From |
|---|---|
| `repository` | Taken from the case's primary `area` (for example `metabase` or `metabase/evals`), or the `--repository` flag |
| `machine_id` | `<user>.<provider>`, which identifies a reporter rather than a physical machine (see the Codex server review) |
| `report_id` | `<slug>:<session>:<first anchor line>` |
| `fingerprint` | `papercut:<slug>`; each `aliases` entry is registered as `papercut:<alias>`, pointing at the same issue |
| `title` | `title` |
| `description` | **Trap** + **Mechanism** + **Fix candidate** |
| `path` | `area[0]` |
| `category` | Derived from `kind`: `codebase-trap` → `code-smell`, `doc-gap` → `documentation`, `misleading-signal` and `agent-behaviour` → `agent-trap`, the rest → `tooling` |
| `observed_at` | `date` |
| `payload` (new) | The whole occurrence, plus `label`, `scope`, `owner`, `outcome`, `severity`, `verification`, `status` |

- **Triage status:** `status.state: fixed | wontfix` sets the issue's triage status to `resolved` or `wontfix` after import, as today.
- **Negative and ambiguous cases:** these are not imported as papercuts. Export them to `pipeline/output/eval-set.jsonl` instead, with one line per occurrence in this form:

```json
{"label": "positive", "slug": "...", "kind": "...", "transcript": "...", "lines": [2046, 2308], "anchors": [2051, 2061, 2219]}
```

## Example: positive

```markdown
---
slug: test-console-fatal-hides-warnings
title: Test stdout is FATAL-only, so a missing warning looks like proof a path never ran
label: positive
scope: core
kind: misleading-signal
owner: repo-tooling
area: [test_config/log4j2-test.xml, bin/test-agent]
outcome: [false-conclusion, wasted-time]
severity: high
verification: source-reviewed
affordance: Console appender has ThresholdFilter FATAL; nothing on screen says warnings go to logs/test-log.json
status:
  state: partly-fixed
  checked_at: 2026-09-23
  revision: bf3d250f132
  where: test_config/log4j2-test.xml:7 (FATAL console); :12 WarnConsole covers only metabase.app-db.connection
  documented_in: []
occurrences:
  - provider: claude
    actor: main
    session: 31b066ea-d480-4a3f-a6f1-0bc74a18367f
    transcript: ~/.claude/projects/-Users-christruter-workspace-metabase-metabase-fix-app-db-rollback-only/31b066ea-d480-4a3f-a6f1-0bc74a18367f.jsonl
    transcript_available: true
    date: 2026-08-25
    outcome: [false-conclusion, wasted-time]
    docs_existed: false
    anchors:
      - {line: 2051, role: tool-output, proves: "grep for the rollback warning returned 0"}
      - {line: 2061, role: agent, proves: "agent dropped the correct hypothesis"}
      - {line: 2219, role: reproduction, proves: "println at the same catch fired every run"}
      - {line: 2232, role: source-check, proves: "log4j2-test.xml:7 has ThresholdFilter FATAL"}
detection:
  transcript_signal: grep of test-agent output for a log string returns 0, followed by "path isn't firing"
  prevention: test-agent footer naming logs/test-log.json with WARN/ERROR counts; CLAUDE.md note
  probe: add log/warn in any namespace, run one test, grep stdout
related: [search-temp-index-ddl-commits-enclosing-with-temp]
sources: [papercuts/claude/chris.claude.test-log-console-fatal-hides-warnings.md]
---
**Verdict:** confirmed misleading signal. Hours were lost and a correct hypothesis was dropped.

**Trap.** The test console shows only FATAL, and warnings go to `logs/test-log.json`, which is
overwritten each run. So grepping test output for a warning gives a guaranteed false negative.

**Observed.**
1. The agent grepped the output for the rollback warning and got 0 hits ([L2051](…#L2051)).
2. It concluded the DDL path wasn't firing and moved on to wrong hypotheses ([L2061](…#L2061)).
3. A subagent's `println` at the same catch fired on every run ([L2219](…#L2219)).

**Mechanism.** …   **Evidence and limits.** …   **Current state.** …   **Fix candidate.** …
```

## Example: negative

```markdown
---
slug: neg-prose-voice-corrections
title: User rewrites review comments for voice and tone
label: negative
scope: adjacent
kind: agent-behaviour
owner: agent-practice
area: [PR review comments]
outcome: [wasted-time]
severity: low
verification: transcript
negative_reason: Style preference with no environmental cause; a classifier's user_correction question fires on it.
status: {state: unknown, checked_at: 2026-09-23, revision: null, where: null, documented_in: []}
occurrences:
  - provider: claude
    actor: main
    session: 1212e408-…
    transcript: ~/.claude/projects/…/1212e408-….jsonl
    date: 2026-09-10
    outcome: [wasted-time]
    docs_existed: true
    anchors:
      - {line: 535, role: user, proves: "user rewords a drafted comment"}
      - {line: 1090, role: user, proves: "further tone edits; no code or tool involved"}
---
**Verdict:** not a papercut. This is a tone preference.

**Observed.** …   **Why not a papercut.** …
```

## Migrating the existing collections

1. **Seed cases from the Claude files**, which already have most fields.
   - Map `impact` to `outcome`, and `status: documented-still-hit` to `open` plus `documented_in`.
   - Take `aliases` from `merged_from`.
   - Move the Jev scores into `screen`.
   - Split `occurrences[].lines` ranges into anchors by rereading the decisive lines.
2. **Fold the Codex files into matching cases**, or seed new ones.
   - Their inline `#L` links become anchors.
   - Their `Classification:` line becomes the **Verdict** plus `outcome` and `verification`.
3. **Resolve the known overlaps** from the Codex learnings report:
   - ci-repository-default: one case.
   - The cluster-lock guard near-miss: its own case, related to `search-temp-index-ddl-…` and `local-test-appdb-differs-…`.
   - merge-preview-compile: a separate case from `comments-dropped-when-moving-code`.
4. **Re-check every `status`** against one pinned commit, and set `verification` honestly. Most cases will start at `transcript`.
5. **Build the negatives** from the Claude calibration false-positive list and the Codex `negative-controls.md`.
6. **Import with `import_local.py`**, once it reads `cases/` and sends the new fields.
