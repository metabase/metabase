# Papercut drill-down brief

PC = <pipeline dir>

Goal: extract papercuts from flagged excerpts of Andrei's Claude Code transcripts. A papercut is a bug or smell in the code, tooling, environment or docs that trips up coding agents: they introduce subtle bugs, or waste time using something incorrectly, fumbling, and coming back to fix their work. The records seed the design and test set of a papercut tracker built at today's hackathon. They will be pushed to the PUBLIC metabase/metabase repo, so the privacy rules below are strict.

## Inputs

- Your batch manifest: `PC/groups/gN.md`. Per chunk: id, transcript path, date, jev scores (12 yes/no questions answered with probabilities by a fast classifier that over-flags heavily; expect about half the chunks to be noise), and hot segments (the classifier's guess where the papercut sits, with probability).
- Read a chunk: `python3 PC/segs.py <cid> <segment numbers>`, e.g. `python3 PC/segs.py abc.1 3 4`. No numbers prints the whole chunk. Segments are about 6k chars. Start with the hot segments; read neighbours or the whole chunk when context is missing. Consecutive chunks of one session overlap by about 6k chars.
- Rendered lines look like `[e123 L456] KIND: text`. `e` is the event index in the transcript, `L` the line number in the raw JSONL. KIND is USER, ASSISTANT, THINKING, CALL, RESULT or RESULT (ERROR). Tool output is truncated. Secrets show as `[REDACTED:...]`, people as `[person]`.
- When truncation hides what you need, read the raw JSONL: `sed -n '456,470p' <transcript> | cut -c1-4000` (expand `~`). The raw file is not scrubbed: never copy secrets, emails, names or customer data out of it.
- Current code: check claims against master, read-only: `git -C ~/src/mb/metabase grep -n <pattern> origin/master -- <path>` or `git -C ~/src/mb/metabase show origin/master:<path>` (origin/master fetched today). Do not read or touch the working tree of `~/src/mb/metabase`: another team is editing it live. A couple of lookups per papercut at most.
- Chris's existing papercut slugs and titles: `PC/chris_slugs.txt`. If yours is the same underlying defect, reuse his slug exactly; the slug is the merge key across people.
- Andrei's memory notes (`~/.claude/projects/-Users-andrei-src-mb/memory/*.md`) record many papercuts he already wrote down. If a papercut hit although a note or doc covering it existed at the time, its status is `documented-still-hit`.
- Harmless repros of shell or tool behaviour are fine inside `PC/tmp/`. Never run tests, builds, dev servers, or anything against a repo.

## What counts

Genuine: something outside the agent's own reasoning that is misleading or easy to misuse. A misleading name, API or docstring; a hidden coupling or invariant; surprising CLI or tool semantics; an environment or toolchain trap; stale cache or state; a local check that disagrees with the CI gate; flaky infrastructure; a doc or instruction that is wrong. A recurring agent habit counts too (kind `agent-behaviour`) when the transcript shows it cost real rework.

Not genuine: ordinary iteration (a typo, a compile error fixed on the next try), the user changing their mind, tone or wording feedback, permission prompts, one-off agent carelessness that nothing invited. Many flagged chunks are standups, PR reviews or Slack drafting with no papercut in them. Say so in `not_papercuts` and move on.

## Out of scope (skip entirely, even when genuine)

- Work on projects other than Metabase, and personal infrastructure (SSH keys, servers, home network, keyboard remaps, personal accounts).
- Anything that would disclose an unfixed security vulnerability, credentials or customer data.
- Papercuts in this mining pipeline itself.

## Output

Write JSON to `PC/drill/gN.json`:

```json
{"papercuts": [record, ...], "not_papercuts": [{"cid": "...", "reason": "one line: why the flag was noise"}]}
```

record:

```json
{
  "slug": "kebab-case naming the underlying defect, not the incident; reuse Chris's slug when it is his papercut",
  "title": "one specific sentence: the trap and what it does to an agent (see Chris's titles)",
  "kind": "codebase-trap | test-harness | misleading-signal | doc-gap | tool-quirk | env-friction | agent-behaviour",
  "impact": "wasted-time | introduced-bug | both",
  "severity": "low | medium | high",
  "status": "open | fixed | documented-still-hit | unknown, optionally followed by ' # short note'",
  "area": "files, commands or components involved",
  "occurrence": {"cid": "...", "transcript": "<path from the manifest>", "lines": "first-last raw JSONL lines of the incident", "date": "YYYY-MM-DD"},
  "summary": "markdown, 2-5 sentences",
  "symptom": "markdown: what the agent saw or did, concretely, with L refs",
  "timeline": "markdown bullets with L refs, ending with the cost (turns, retries, minutes, or what shipped broken)",
  "root_cause": "markdown; say what is unknown rather than guess",
  "why_agents_fall_for_it": "markdown",
  "current_state": "markdown: what you checked on origin/master, or 'not checked'",
  "suggested_fix": "markdown bullets: code, tooling or doc changes that remove the trap",
  "detection_signal": "markdown: what a transcript or runtime scanner could match",
  "raw_excerpts": "verbatim lines as 'L123 [KIND] text', up to about 25 lines, scrubbed",
  "confidence": 0.0
}
```

One record per distinct papercut per session. If the same papercut recurs in several of your sessions, emit one record per session; a later step merges by slug.

## Privacy (the output goes public)

No secrets or tokens. No emails. No personal names or GitHub/Slack handles: write "the user", "a reviewer", "a teammate". No customer or company names other than Metabase, no customer data or query results. No internal hostnames, IPs or non-public URLs (Slack, Linear, Notion links, internal dashboards). No private repo contents beyond the file and function names needed to explain the trap. Home paths as `~`. No PR numbers or ticket IDs in titles or slugs.

## Style

Plain English, specific, terse. No em dashes anywhere: use commas, colons, parentheses or en dashes. No filler.

## Rules

Write only `PC/drill/gN.json` (and scratch files under `PC/tmp/`). No git writes, no posts to any service, no edits anywhere else. When done, reply with one line: the slugs written and the number of noise chunks.
