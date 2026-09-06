# python-library.cy.spec.ts → tests/python-library.spec.ts

Slot 3 (:4103). Source: `e2e/test/scenarios/data-studio/transforms/python-library.cy.spec.ts` (57 lines, 1 describe, 1 `it`).

## Summary (3 lines)

The brief's headline prediction — "expect this to be blocked" — is **wrong for this spec**, and I verified both legs rather than inheriting them. The python *library* is a pure CRUD/editor surface with no S3 and no python-runner on its path, and its gate is `transforms-python` (which `pro-self-hosted` **does** grant), not `transforms-basic`. The port is fully green: **1 of 1 test executed, 0 unexecuted, 0 fixme**, stable at `--repeat-each=3`, three mutants killed at the correct lines, tsc clean.

## Collision checks

- `grep -rl "python-library" tests/ support/` → only `support/transforms.ts` (helper *names* containing `python-library`, i.e. the `python-library-header` testid). **No port of my source exists.**
- `tests/transforms.spec.ts` contains a `python > common library` describe, but that is the port of a **different upstream file** (`transforms.cy.spec.ts`), covering different `it`s (edit+revert via `visitCommonLibrary`, and a list-page navigation test). My spec's single `it` — list link → placeholder assertions → type → Save → toast → reload → persistence — has no counterpart. No overlap to resolve, nothing stopped.
- Nothing shared was edited. No commit. Port 4000 untouched.

## Support module — ⚠️ NOT `support/python-library.ts`

**I created no support module at all.** Every helper the port needs already existed and is imported **read-only**:

| helper | module |
| --- | --- |
| `DataStudio` (`.Transforms.visit`, `.PythonLibrary.editor`), `QA_DB_SKIP_REASON`, `createSqlTransform`, `resetTransformTargetTables` | `support/transforms.ts` |
| `resetManySchemasTable` | `support/transforms-codegen.ts` |
| `SnowplowCapture`, `installSnowplowCapture`, `expectNoBadSnowplowEvents` | `support/search-snowplow.ts` |
| `undoToast` | `support/transforms-indexes.ts` |

One API-shape trap: `PythonLibrary` is a **sibling** of `Transforms` under `DataStudio`, not nested inside it (`DataStudio.PythonLibrary.editor`, matching upstream `H.DataStudio.PythonLibrary`). My first draft wrote `DataStudio.Transforms.PythonLibrary` and died on it.

## The exact predicate for each endpoint, and both arms

Endpoints this spec hits: `GET /api/ee/transforms-python/library/common.py` and `PUT` the same.

**Traced, not assumed.** `enterprise/backend/src/metabase_enterprise/transforms_python/api.clj` — neither endpoint calls `transforms/crud.clj:check-feature-enabled!`. The PUT's only in-body guard is `api/check-403 (perms/has-any-transforms-permission? …)`. The feature gate is the **route mount**:

```clojure
;; enterprise/backend/src/metabase_enterprise/api_routes/routes.clj:144
"/transforms-python" (premium-handler metabase-enterprise.transforms-python.api/routes :transforms-python)
```

So the predicate is **`:transforms-python`**, not `transforms-basic`, and the MBQL/SQL-vs-python split in `check-feature-enabled!` is **irrelevant to these two endpoints**.

Measured on :4103 (fresh `restore/default` each arm):

| arm | features ON | `transforms-python` | `transforms-basic` | GET /library | PUT /library |
| --- | --- | --- | --- | --- | --- |
| no token | 0 | false | false | **402** | **402** |
| `pro-self-hosted` | **42** | **true** | false | **200** | **200** |
| all-features | 53 | true | true | 200 | 200 |

The brief's claim that python "requires `transforms-basic` with no short-circuit" is **correct as a statement about `check-feature-enabled!`** but does not apply here — `transforms-basic` is false in the passing arm and the endpoints return 200 anyway.

## Is :4566 up? — no, and it does not matter

- localstack **:4566 DOWN** (confirmed).
- python-runner **:5001 DOWN** (confirmed).
- writable postgres **:5404 UP**.

Both dead services are genuinely dead, so that leg of the brief is true. It is **inapplicable** to this spec: the library is backed by the app DB (`models/python_library.clj`); only `POST …/test-run` and real transform *execution* touch S3 and the runner. Upstream never calls `H.setPythonRunnerSettings()`. The brief's own instruction to "check whether the library surface needs python at all" was the right question, and the answer is no.

Jar verified by identity: `version.properties` hash `751c2a9` = `COMMIT-ID 751c2a98`.

## Executed vs unexecuted

**1 executed / 0 unexecuted / 0 fixme / 0 dropped, weakened or merged.** Every upstream assertion is present.

## Gate mapping, with the gate-OFF control

Queue gates were **snowplow, token**. Actual mapping:

- **`token` — REAL and load-bearing.** Two-arm UI control: with `activateToken("pro-self-hosted")` removed and the QA gate still on, the test **fails at line 126** — `getByRole("link", {name:/Python library/})` times out at 30s, because the FE hides the row without `transforms-python`. This is the **opposite** of the sibling's finding on a different transforms spec (where `token` was a pure red herring); the brief was right to tell me to measure rather than match. Control reverted; the file is byte-identical (md5 below).
- **QA-DB gate** (`PW_QA_DB_ENABLED`) added, because upstream restores `postgres-writable` and resets `many_schemas`. **Gate-OFF control: 1 skipped, 0 passed** — no false green.
- The gate sits at **describe level**, deliberately: the describe has an `afterEach`, so a `test.skip()` in the body would let `beforeEach` run (and activate a token) before skipping.

## Snowplow vantage

**Browser boundary — and it is not dead setup.** Upstream's `afterEach` runs `H.expectNoBadSnowplowEvents()`, a real assertion, so I did not no-op it. The only emitter on this path is FE (`frontend/src/metabase/transforms/analytics.ts`); grep finds no backend `analytics/track-event!` in the transforms modules, so the per-slot collector is the wrong vantage on the merits — and it is also blind here, since its preflight omits `Access-Control-Allow-Credentials` and the tracker's credentialed POST dies `net::ERR_FAILED`. **Fix not applied** (shared module).

Cost stated rather than hidden: without snowplow-micro, `expectNoBadSnowplowEvents` degrades from "no event failed Iglu validation" to "no payload failed to decode into a well-formed self-describing envelope". Strictly weaker. The backend-collector offset hazard (passing on a predecessor's queued event) is **inapplicable** — the collector is not used.

## Slot 3 final feature count

**42** with `pro-self-hosted` (53 with all-features, 0 with none). Measured off `/api/session/properties` `token-features`, not matched to the disputed 42-vs-52 figure. No token values printed.

## Mutation results

Baseline md5 `a08258a4bc79ec445bfa10c646109031`; **restored byte-identical after every mutant and both controls**.

Verifier sanity-checked before use: baseline green runs in ~1.5–2.5s, every mutant burns ~11s (the retry timeout counting down). That runtime tell distinguishes a genuine assertion failure from an instant structural error, and all three mutants show it.

| # | mutation | died at | reading |
| --- | --- | --- | --- |
| M1 | **input inversion** — type `print('goodbye world')` | line 156, the **post-reload** assertion | The full type → Save → reload → persist chain is load-bearing; the final assertion reads persisted server state, not stale DOM. |
| M2 | comment out `saveButton.click()` | line 151 (toast) | Correct, but it dies *earlier* than the persistence assertion, so **M2 does not independently prove persistence** — M1 is the one that does. Calling this out rather than double-counting it. |
| M3 | corrupt help-comment regex | lines 135-137 | The initial-content assertions are real. |

## Fixmes and notes worth keeping

- **No fixmes.**
- Upstream's `cy.log("make sure placeholder with help comment is displayed")` is **wrong**: `EMPTY_LIBRARY_SOURCE` in `PythonLibraryEditorPage.tsx` is the editor's `value`, not a CodeMirror placeholder, so those are real document lines. Assertions ported unchanged; the misnomer is corrected in a comment only.
- **CodeMirror Enter/`interactionDelay` hazard: inapplicable.** `withPandasCompletions` is on, but the typed string contains no Enter and accepts no completion.
- **`pressSequentially` caret hazard: inapplicable as written.** The preceding `.click()` sets the caret, mirroring upstream's `.click().realType()`. I deliberately did *not* substitute `focusPythonEditor` (which seeks the document end) — that would move where the text lands relative to upstream.
- `cy.url().reload()` is just `cy.reload()`; `reload` is a parent command and ignores the `cy.url()` subject.
- `resetTransformTargetTables()` has **no upstream counterpart**. The writable postgres is long-lived and shared across slots, so a leftover `"Schema A"."table_a"` makes `createSqlTransform` 403 on the physical already-exists check that CI avoids by provisioning fresh. It restores a precondition; it changes no assertion. No foreign schemas dropped.

## tsc

`bunx tsc --noEmit` → exit 0, no output. Dead-import hand-audit (tsc is silent on these): all 10 imported bindings are used.
