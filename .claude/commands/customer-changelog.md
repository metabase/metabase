Generate a customer-facing changelog draft for $ARGUMENTS in the voice of https://www.metabase.com/changelog/59.

`$ARGUMENTS` is one of:
- `#12345` or `12345` — single PR
- `v59.5` (or `v0.59.5` / `v1.59.5`) — specific point release
- `v59` — pending changes on the v59 release branch
- `<ref>..<ref>` — explicit git range (e.g. `v0.59.3..v0.59.4`, `v0.59.4..origin/release-x.59.x`)

Be rigorous. The published changelog is a tight curated list; most merged PRs do NOT appear.

---

## Argument parsing

Normalize before dispatching:
- If the argument contains `..`, treat it as **explicit-range mode** — use the range verbatim. Do NOT normalize or alter the refs. Validate immediately (see below) and stop with an error if invalid.
- Strip leading `#` from bare PR numbers.
- `v<major>` (e.g. `v59`) → major-pending mode.
- `v<major>.<minor>[.<patch>]`, with or without a leading `v0.`/`v1.` → point-release mode targeting OSS tag `v0.<major>.<minor>[.<patch>]`.
- Plain integer → single-PR mode.

Tag naming in this repo:
- OSS: `v0.<major>.<minor>[.<patch>]` (prefer this form).
- EE: `v1.<major>.<minor>[.<patch>]`.
- Release branch: `release-x.<major>.x`.

## Resolving commit ranges

Run `git fetch --tags origin` first. If it fails, warn the user and continue with local refs.

- **explicit-range (`<ref>..<ref>`):**
  1. Validate both sides exist: run `git rev-parse --verify <left>` and `git rev-parse --verify <right>`.
  2. If either side fails, **stop immediately** with: `Error: '<ref>' is not a valid git ref. Please check the range and try again.` Do not guess at corrections or continue.
  3. Use the range exactly as provided. The output filename is derived from the two refs with `..` replaced by `--` (e.g. `v0.59.3--v0.59.4-changelog-draft.md`). The file header range field shows the literal argument.
- **single-PR:** just the one PR; skip range resolution.
- **point-release (`v59.5`, `v59.5.2`):**
  1. `git tag -l 'v0.<major>*' --sort=-v:refname`.
  2. Prev tag = highest tag strictly less than the target in semver order. For `v59.5` this is typically `v0.59.4` (or a `v0.59.4.x` patch). For `v59.5.2` it is `v0.59.5.1` or `v0.59.5`.
  3. Range: `<prev-tag>..v0.<major>.<minor>[.<patch>]`.
- **major-pending (`v59`):**
  1. Latest `v0.59.*` tag exists → range `<latest-tag>..origin/release-x.59.x`.
  2. No such tag → `$(git merge-base origin/master origin/release-x.59.x)..origin/release-x.59.x`.

## Enumerating PRs in a range

```
git log --pretty='%H%x09%s' <range>
```

Extract PR numbers from subjects:
- Squash merges end with ` (#NNNNN)`.
- `Merge pull request #NNNNN from …` for merge commits.
- `🤖 backported "…" (#NNNNN)` for automated backports — the `#NNNNN` IS the PR to analyze (it's the backport PR itself).

Deduplicate. Each unique PR is analyzed once.

## Per-PR analysis (parallel sub-agents)

For each PR, spawn a `general-purpose` sub-agent. Launch in **batches of up to 10 in parallel** (multiple Agent tool calls in one message).

Sub-agent prompt:

> You are analyzing a single Metabase pull request for a customer-facing changelog draft.
>
> **PR:** #<NUM>
>
> Steps:
> 1. Run `gh pr view <NUM> --repo metabase/metabase --json number,title,body,labels,author,mergedAt,baseRefName,files,url,additions,deletions`.
> 2. Run `gh pr view <NUM> --repo metabase/metabase --comments` and skim reviewer comments for scope/impact clues.
> 3. From the PR body, extract issue references (`Fixes #`, `Closes #`, `Resolves #`, bare `#NNNNN`). For the PRIMARY fixed issue (the first one listed, or the most user-facing), run `gh issue view <N> --repo metabase/metabase --json number,title,body,labels,state`.
> 4. Decide whether this belongs in the customer changelog using the rules below. Return `null` for `category` and `changelog_entry` if it does not.
> 5. Write a 2–3 sentence summary of what the PR actually does and a 1-sentence include/exclude reason.
>
> ### Include when:
> - Bug affecting an end user, admin, or operator in normal use. Examples from real changelogs:
>   - "startup fails in 1.59.2.6 from stack overflow in loading analytics"
>   - "Question with self-join on Redshift cluster throws an error"
>   - "Migration failure on large metabase_table during upgrade to v59"
>   - "Dancing full-width dashboard embed due to scrollbar show-hide loop"
> - New feature or capability a user would notice (new viz, new auth option, new embedding prop, new admin action).
> - Behavior change that could surprise an existing user (filter semantics, default change, renamed concept).
> - Breaking change, deprecation, minimum-version bump — these get their own "Breaking changes" section.
> - Security fix (gets a prominent preamble — look for security labels or CVE language in the PR).
> - Database driver compatibility change visible to users.
> - Small admin-facing enhancement with an operator-visible effect (e.g. "Include lock name in cluster lock log and error messages", "Sanitize database details during serialization import") — these are routinely listed under Enhancements.
>
> ### Exclude when:
> - Pure internal refactor, renaming, or code cleanup.
> - Test-only change, including flaky-test fixes ("Fix flaky test", "Fix search related testing race conditions", "Fix clickhouse test flake" — all excluded from real releases).
> - CI/build/workflow change unless it fixes something visible on release cadence or in downloads.
> - Dependency bump without a called-out user-facing behavior change ("Bump databricks jdbc driver to 3.3.1", "Pin google auth dependency to avoid driver mismatches" — excluded).
> - Docs-only PRs (`docs:` prefix).
> - Feature-flagged / experimental / gated behind a non-default flag.
> - Revert of something that never shipped to users.
> - Automated doc re-generation ("Auto-update documentation for release-x.59.x").
> - PRs whose only effect is internal observability / telemetry.
> - Test data / fixtures / infrastructure-only changes.
>
> Edge case: **CI/build housekeeping that the team explicitly wants visible** (e.g. "Delete Claude bug fix workflow", "Use env var indirection in Loki stress-test workflow") — set category to `Under the Hood`. Use this sparingly.
>
> ### Phrasing rules for `changelog_entry`:
>
> The most important rule: **in real changelogs the bullet text is almost always the linked GitHub issue title, verbatim**, including its original capitalization, phrasing, and even typos. Do NOT rewrite into marketing copy.
>
> - If the PR's primary `Fixes #N` issue has a clear, user-oriented title, use that title verbatim as `changelog_entry`. Trim trailing punctuation only.
> - If the issue title is cryptic or internal-sounding, rewrite to a short user-symptom phrase in the same register (informal, descriptive, specific). Examples of acceptable voice: "Dancing full-width dashboard embed due to scrollbar show-hide loop", "Question with self-join on Redshift cluster throws an error".
> - Do NOT include the PR number or author. The trailing `(#N)` is added later by the main agent and uses the ISSUE number (from `Fixes #N`), not the PR number. If no issue is linked, the PR number is used as a fallback.
> - For features/enhancements, use a noun phrase or short verb phrase: "Server-side rendering for comment emails", "Sanitize database details during serialization import", "List dependencies for incremental transforms".
> - Parentheticals for scope are preserved when present in issue titles (e.g. "(Pro/enterprise only)"). Do not invent them if they aren't there.
>
> ### Category
>
> Category must be one of (these are the labels observed across v58/v59/v60 bug-fix and enhancement sections):
>
> `Administration`, `Database`, `Embedding`, `Querying`, `Visualization`, `Reporting`, `Operation`, `Organization`, `Metabot`, `Data studio`, `Transforms`, `AI`, `Other`, `Under the Hood`, `Breaking change`, `Security`.
>
> Pick the single closest match from the PR's files and issue labels. Prefer specific categories (`Database`, `Embedding`, `Visualization`) over `Other`. For enhancements that apply to app-wide admin surfaces use `Administration`. For operator/deploy-facing items use `Operation`.
>
> Flag Pro/Enterprise/Cloud scoping in a separate `scope` field, detected from: `enterprise/` or `ee/` paths in changed files, labels containing `ee`/`pro`/`cloud`, or explicit mentions in the PR body.
>
> ### Response format
>
> Respond with ONLY a single fenced JSON block (no prose outside the fence):
>
> ```json
> {
>   "pr": <NUM>,
>   "pr_title": "...",
>   "pr_url": "https://github.com/metabase/metabase/pull/<NUM>",
>   "issue": <ISSUE_NUM or null>,
>   "issue_url": "https://github.com/metabase/metabase/issues/<N>" or null,
>   "category": "Querying" | "Breaking change" | "Security" | "Under the Hood" | null,
>   "section": "Bug fixes" | "Enhancements" | "New features" | "Breaking changes" | "Under the Hood" | null,
>   "changelog_entry": "..." | null,
>   "scope": "Pro/enterprise only" | "Cloud only" | null,
>   "summary": "2-3 sentence PR summary.",
>   "decision_reason": "One sentence why included or excluded."
> }
> ```

If a sub-agent returns malformed JSON, retry once; if still bad, record as excluded with `decision_reason: "Sub-agent returned malformed output; manual review needed"` and continue.

## Output

### Single-PR mode

Print to the conversation (no file):
- **Decision:** `Included (<category> / <section>)` or `<do not include in release notes>`
- **Entry:** the one-liner (or `n/a`)
- **Issue:** link if any
- **Summary:** 2–3 sentences
- **Reason:** 1 sentence

### Release mode

Write to `./<arg>-changelog-draft.md` at the repo root (e.g. `v59.5-changelog-draft.md`, `v59-changelog-draft.md`). Overwrite if it exists.

Structure mirrors the real Metabase changelog pages. Sections appear only if non-empty, in this order:

1. **Security preamble** — if any included PR has `category: "Security"`, lead with the 58.7-style banner:
   > If you are running a v<major> point version prior to <version>, please upgrade your Metabase to the latest version immediately.
   >
   > Metabase <version> fixes a critical security issue. For more details, see our post on the Security update.
2. **Breaking changes** — bulleted list of entries where `category: "Breaking change"`. No sub-grouping.
3. **New features** — only for major releases (`v<major>` with no prior `v0.<major>.*` tag, or when PRs include `section: "New features"`). Group by category heading in bold (`**AI**`, `**Querying and visualization**`, etc.) with bullets + optional nested sub-bullets for details and doc links.
4. **Enhancements** — bullets from `section: "Enhancements"`, grouped by `category` as bold sub-headings (e.g. `**Administration**`, `**Data studio**`, `**Other**`). If there are only a few, omit sub-headings and list flat.
5. **Bug fixes** — bullets from `section: "Bug fixes"`, grouped by `category` as plain category labels (matching the real pages, which use bold-free single-word labels like `Administration`, `Database`, `Embedding`, `Querying`, `Visualization`, `Reporting`, `Operation`, `Organization`, `Other`, `Metabot`).
6. **Under the Hood** — bullets from `category: "Under the Hood"`.

Bullet format, matching the published style exactly:

```
- <changelog_entry> (#<issue_number>)
```

If no issue number was linked on the PR, fall back to `(#<pr_number>)`.

After these sections, add two internal-only sections (not present on the public page but useful for the human editor):

```markdown
---

## All PRs considered

| PR | Title | Decision | Reason |
|---|---|---|---|
| [#12345](url) | ... | Included (Querying / Bug fixes) | ... |
| [#12346](url) | ... | Excluded | Internal refactor, no user impact |

## Per-PR details

### [#12345](url) — <pr_title>
**Decision:** Included (Querying / Bug fixes) — "<changelog_entry>" (fixes [#70952](issue_url))

<2–3 sentence summary>

### [#12346](url) — <pr_title>
**Decision:** Excluded — <one sentence reason> (refs [#70953](issue_url))

<2–3 sentence summary>
```

File header:

```markdown
# Metabase <version> — customer changelog draft

_Generated <YYYY-MM-DD> from <N> merged PRs in range `<prev-ref>..<target-ref>`. <included> included / <excluded> excluded._
```

After writing, print to the conversation:
- The absolute output file path.
- `<included>` included / `<excluded>` excluded out of `<total>`.
- The generated **Bug fixes** section as a preview.

## Notes

- Do NOT modify any other files. This command is read-only against the repo plus one generated draft at the root.
- `gh` must be authenticated. If the first `gh pr view` fails on auth, stop and ask the user to run `gh auth login`.
- If the range resolves to zero PRs, say so and exit without writing a file.
- Trust and preserve issue-title phrasing — these are the exact words users see. Do not "clean them up".
