---
name: api-changelog
description: Draft or audit the REST API changelog (docs/developers-guide/api-changelog.md) by semantically diffing the checked-in OpenAPI spec between two git refs. Use when asked "has the API changelog been updated", "what are the breaking API changes in vNN", when cutting a release branch, or when reviewing whether a PR needs a changelog entry.
---

# API changelog

Answers "what changed in the REST API between two versions, and is the changelog
honest about it?"

## Ground truth

`resources/openapi/openapi.json` is generated from the Malli endpoint schemas, so
the spec at any git ref is what the API actually was at that ref. Diff the spec,
do not read endpoint source or boot a server.

Response coverage is partial: about 199 response entries declare a real schema
and are compared, but roughly 1,700 are description-only `2XX/4XX/5XX` stubs. For
an endpoint with no declared response schema, a response-shape change is
invisible here. Say so rather than implying the diff is complete.

### Check the spec is fresh first - it usually is not

The self-healing CI job (`.github/workflows/openapi-check.yml`) only runs on PRs
labelled `openapi-self-healing`, so the committed spec drifts behind master by
default. Verify before trusting a diff:

```bash
./bin/mage openapi-staleness
```

If the source is newer, regenerate before diffing the new ref:

```bash
bun run generate-openapi   # rewrites resources/openapi/openapi.json in place
```

Regenerating needs a working backend env, and it only produces the spec for the
*current working tree* - you cannot regenerate a historical ref. So for an old
ref, use its committed spec and flag that entries may be missing. A change
present in source but absent from the committed spec is a **false negative**:
this tool will not report it. Confirm suspected gaps with
`grep -rn "defendpoint" src/.../api.clj`.

## Steps

1. Pick the refs. Default old ref = the previous release branch
   (`origin/release-x.63.x`), new ref = the one being released
   (`origin/release-x.64.x`) or `origin/master`. Confirm with the user if
   ambiguous. `git fetch origin` first.

2. Extract and diff:

   ```bash
   # Preferred: generate both specs from source. ~2 min (two JVM boots), no drift.
   ./bin/mage openapi-diff --refs origin/release-x.63.x origin/release-x.64.x --severity breaking

   # Fast, but reads the committed spec, which lags source. Warns when it does.
   ./bin/mage openapi-diff --refs --committed origin/release-x.63.x origin/release-x.64.x

   # Two spec files directly.
   ./bin/mage openapi-diff /tmp/old.json /tmp/new.json --severity breaking
   ```

   `--refs` checks each ref out into a throwaway worktree and runs that ref's own
   `generate-openapi-spec`, so it works on any ref and never touches your checkout.
   Prefer it: `--committed` reports "0 findings" between v63 and master, which is
   an artifact of both refs carrying the same stale blob, not an API that did not
   change.

### Group systematic changes before drafting

   A single upstream change can produce hundreds of findings. v63 -> master reports
   239 breaking, but 217 are the identical line `body now rejects undeclared keys`
   from one PR (#82447, closing `mu/defn` argument schemas). That is **one changelog
   entry**, not 217.

   Before writing anything, collapse findings by their text and look at the counts:

   ```bash
   ./bin/mage openapi-diff --refs <old> <new> --severity breaking \
     | grep -E "^\s+[+~!-]" | sed 's/^ *//' | sort | uniq -c | sort -rn | head
   ```

   A finding repeated across many endpoints is a systematic change: write it once,
   name the cause, and say which endpoints it spans. The long tail of one-off
   findings is where the individually-interesting entries are.

   Findings are classified and sorted breaking-first.

   **A change is breaking when it requires MORE from the caller, or provides LESS
   to the caller.** Anything else is just a change. The rule is directional, and
   it inverts between request and response:

   | | Breaking (requires more / provides less) | Not breaking |
   |---|---|---|
   | **Request** | field or param becomes required; type or enum narrowed; `additionalProperties: false` added; field removed | new *optional* field or param; type or enum widened; field made nullable; schema opened |
   | **Response** | field removed; field may now be `null` | new field returned; field that was nullable never is |
   | **Endpoint** | removed | added |

   Adding an optional parameter is not breaking. Returning extra data is not
   breaking. Existing callers keep working in both cases.

   Start from `--severity breaking`. The long tail of API change is additive
   (a public Stripe-spec diff found 663 of 679 changes additive); reading the
   full diff to find the breaking few is how entries get missed.

   If the two blobs are identical, `git rev-parse <ref>:resources/openapi/openapi.json`
   on both to confirm, and report "no API surface changes" - do not invent entries.

3. Review the classification. The tool decides severity structurally, but two
   cases still need your judgement:
   - **A removed + added pair is often one endpoint moving** (method change, or a
     param moving between query/path/body). The tool reports two findings; read
     the docstrings to pair them and write ONE changelog entry describing the move.
   - **An `ADDITIVE` finding can still be worth an entry** when it is a new
     endpoint clients should know about. Additive means "will not break existing
     callers", not "not worth mentioning".

4. For every breaking change, decide whether you can state **what it does for a
   client** from the spec's `description` alone. If you cannot, do not guess and
   do not paper over it - list it under "Needs author input" with the endpoint
   name and what is unclear. Thin endpoint docstrings are the actual finding;
   report them loudly.

5. Cross-check `docs/developers-guide/api-changelog.md` for the target version.
   Report three buckets:
   - **Undocumented**: breaking changes with no changelog entry -> draft entries
   - **Stale**: changelog entries with no matching spec change -> verify by hand
     (may be a response-shape or behavior change the spec cannot see - do not
     delete without asking)
   - **Covered**: matched, no action

6. Draft entries in the existing house style: `## Metabase 0.64.0` heading,
   one `-` bullet per change, endpoint as `` `POST /api/foo/:id` `` with
   **`:id` colon-style params, not OpenAPI `{id}` braces**. Say what changed, what
   clients must do, and whether there was a deprecation period. Apply the
   `de-slop` skill. Show the diff before writing to the file.

## Attribution

Find who to ask about an unclear change:

```bash
git log --oneline <old-ref>..<new-ref> -- resources/openapi/openapi.json
git log -1 --format='%an %s' <sha>
```

The commit that changed the spec is the PR that changed the API.

## Backports

A change landing in both `0.64.0` and older lines gets a full entry under the
newest version and a one-line pointer under each backport version
("See the 0.64.0 entry."). Match the existing `POST /api/slack/bug-report` pattern.

## Staleness check (run first)

```bash
./bin/mage openapi-staleness
```

Exits non-zero and lists the offending commits when the spec predates the newest
API source change. A stale spec produces FALSE NEGATIVES, never false positives:
a change in source but not in the spec is simply not reported. Treat a failing
staleness check as "this diff may be incomplete", not as "no changes".
