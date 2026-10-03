# 58957: static embed CSV download sends a single-value filter as an array

## Where the code moved
Fix `106a53e50c` changed an inline `convertSearchParamsToObject` inside `getDatasetParams`
(downloads.ts:236). At `8317274709c` it is a module-level function at
`frontend/src/metabase/redux/downloads.ts:361`, called from `getEmbedQuestionParams` only when
`isEmbeddingSdk()` is false (static embed iframes). Guest/SDK embeds use the caller's params instead
(EMB-1549). July's 3-line patch conflicts because a `// Unjustified type cast. FIXME` line now sits
above the `concat` line; the logic has not changed.

## The mutant (one line)
`object[key] = value;` becomes `object[key] = [value];` in the first-occurrence branch. That matches the
pre-fix behaviour exactly: the first occurrence becomes `[v]` and later ones go through
`concat([v], v2)`, giving `[v, v2]` like the old spread. The type `Record<string, string | string[]>`
still accepts it, so it compiles.
The backend still passes that array through unchanged. `apply-slug->value` in
`embedding_rest/api/common.clj` only normalises operator params (`date/single` isn't one), and
`parse-value-for-type` sends `:date` tags to `lib/parsed-date-param`, whose schema accepts a date
string only. So the user-visible failure still happens.

## Oracle
Existing tests on master only cover guest embeds and multi-key static embeds, so there was no
direct test for this bug. July's `witness.patch` applies cleanly (offset +1 line) to
`downloads.unit.spec.ts`. It sets `?created_at=2025-02-11` through `history.replaceState`, mocks
`isEmbeddingSdk` as false, and checks the JSON `parameters` that `getDatasetParams` builds.

Clean HEAD + witness: `Tests: 16 passed, 16 total`, including
`✓ encodes a single-occurrence filter value as a scalar, not an array (metabase#58957)`.

Mutant:
```
✕ encodes a single-occurrence filter value as a scalar, not an array (metabase#58957)
  -   "created_at": "2025-02-11",
  +   "created_at": Array [ "2025-02-11", ],
  > 124 | expect(JSON.parse(url.get("parameters") ?? "")).toEqual({
```
The existing master test `falls back to window.location.search for static embed iframes` also fails
on the mutant (`country: ["Brazil"]`, `quarter: ["Q1"]`). If you want an oracle with no added test,
use that one. I kept the July witness as the named oracle because the record's `hint` points at it
and it uses the single date value from the e2e test.

## Adversarial check
This is a pure function test. There's no rendering, no network and no timers. The failure is a
`toEqual` diff on the serialised payload, and the only difference is scalar vs one-element array,
which is the change the fix made. The other 14 tests in the file still pass on the mutant, so
nothing else breaks.

## Variants (the oracle run is the whole spec file)
- v1, repeat branch overwrites (last value wins): survives. No test repeats a key.
- v2, half fix that spreads the existing value on repeat (`[...object[key], value]`), which splits
  "NY" into characters: survives, same reason. A test with `?state=NY&state=CA` would kill both
  (the metabase#52430 e2e test covers this, but no unit test does).
- v3, inverted `isEmbeddingSdk()` choice: killed (static embed sends `{}`), along with both
  existing embed tests.

## Gotchas
- `window.location` is shared across tests in the file. The `afterEach` in the describe resets it
  with `setLocationSearch("")`. Keep the witness inside that describe.
- No `.cljc` was touched, so no cljs rebuild was needed. The worktree's `target` is still a symlink.
- The worktree was restored after each run and `git status --porcelain` is empty.
