# Agent papercuts from Chris's conversation history

Captured 2026-09-23. These are examples for designing and testing a tool that spots code or tooling traps that make an agent introduce a subtle bug, trust a false result, or spend time undoing work. Each case file contains the observed sequence, the suspected mechanism, and transcript pointers. The source transcripts remain in place; this directory holds curated excerpts and pointers rather than copies of entire conversations.

## Cases

| File | Failure mode | Observation |
| --- | --- | --- |
| [chris.codex.nested-field-paths.md](chris.codex.nested-field-paths.md) | One field carries two incompatible path conventions | BigQuery siblings silently collapsed in context sent to an LLM |
| [chris.codex.mcp-session-tests.md](chris.codex.mcp-session-tests.md) | Tests omit protocol setup | Scope test passed vacuously after a 400 response |
| [chris.codex.eval-archive-schema.md](chris.codex.eval-archive-schema.md) | Cross-repo version contract exists only in an issue | New eval archives quarantined while CI stayed green |
| [chris.codex.kondo-cache.md](chris.codex.kondo-cache.md) | Linter depends on a warm cache that CI deletes | A prohibited form passed the Clj-Kondo job |
| [chris.codex.snapshot-staging.md](chris.codex.snapshot-staging.md) | Temporary output lives in the worktree outside ignore rules | Repeated runs left untracked snapshot data and commit risk |
| [chris.codex.demo-index-hook.md](chris.codex.demo-index-hook.md) | Direct write bypasses indexing hook | Edited description left a stale Library index |
| [chris.codex.module-escape-hatch.md](chris.codex.module-escape-hatch.md) | Migration escape hatch looks like a normal option | New module added exceptions and failed a ratchet |
| [chris.codex.ci-repository-default.md](chris.codex.ci-repository-default.md) | Numeric PR lookup assumes one repository | CI helper returned another repo's PR |
| [chris.codex.provenance-alias.md](chris.codex.provenance-alias.md) | Identity normalized at several boundaries | Provider runs risked discard on publication |
| [chris.codex.test-path.md](chris.codex.test-path.md) | Test replaces PATH with Linux-specific locations | Local macOS run failed despite installed jq |
| [chris.codex.active-search-table.md](chris.codex.active-search-table.md) | Mutable active table hidden behind helper return value | Retry and row count could target different tables |
| [chris.codex.mallidoc-validation.md](chris.codex.mallidoc-validation.md) | Schema docstring also controls validation text | A prose change altered an API error |
| [chris.codex.kondo-import-hook.md](chris.codex.kondo-import-hook.md) | Imported hook depends on absent classpath library | Startup warnings and a failed config repair |
| [chris.codex.semantic-setting.md](chris.codex.semantic-setting.md) | Removed-setting check reads presence instead of Boolean value | Setting `true` could block startup |
| [chris.codex.loading-state-type.md](chris.codex.loading-state-type.md) | Type claims loading state cannot occur | Strict date utility could throw during render |
| [chris.codex.merge-preview-compile.md](chris.codex.merge-preview-compile.md) | New master caller intersects a moved branch API | Merge-preview CI failed across many jobs after local checks passed |
| [chris.codex.cluster-lock-transaction.md](chris.codex.cluster-lock-transaction.md) | Same transaction guard means different things across backends | Near-miss search-index leak and misleading test diagnosis |
| [chris.codex.negative-controls.md](chris.codex.negative-controls.md) | Two ordinary workflow conversations | Examples the papercut classifier should leave unflagged |

## Search scope and limitations

- Codex: enumerated about 5,800 JSONL session/archived-session files. The parallel date-partition pass screened interactive sessions using transcript metadata and correction/failure signals, then read promising conversations. August contained 1,863 files but 182 top-level CLI sessions; September contained 1,004 files but 136 top-level CLI sessions. Most other files were automated review, guardian, or subprocess sessions. They were enumerated, not all semantically read. The March–July partition contained 2,924 files and was screened similarly.
- Claude Code: enumerated 674 project JSONL files, of which 247 had human turns under the parser's filter. Human turns were scored for correction/failure language and selected sessions were read for context. This is a heuristic pass, not an exhaustive semantic classification.
- OpenCode's local SQLite database had zero sessions/messages. Cursor, Copilot, and Aider locations did not reveal a usable transcript archive in the checked paths. Other unknown transcript stores may exist.
- The user clarified that Jev is TypeSafe's API model, documented by the installed Claude TypeSafe skill, and located `TYPESAFE_API_KEY` in this repo's `.env`. Jev classified all 696 extracted interactive sessions in 70 parallel batches using selected, redacted human/assistant turns. The [machine-readable screening scores](chris.codex.jev-screen.jsonl) retain source paths and selected line numbers. Twelve sessions scored at least 0.8, 179 scored 0.5–0.8, 443 scored 0.2–0.5, and 62 scored below 0.2. Scores were used to prioritize review, not treated as truth: several verified cases scored below 0.5 because the compact excerpt omitted the crucial evidence. Parallel agents and manual reading supplied additional cases. This is a best-effort collection, not a verified exhaustive inventory of every conversation on the machine.
- Some cases come from Claude sessions even though their filenames follow the requested `chris.codex.*` pattern. Each case identifies its source.

The cases describe historical states. A recorded fix or PR is evidence of work in the transcript, not a fresh assertion that the current code still has the defect. Security-related case notes omit tokens and secrets.
