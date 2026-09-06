# query-external — port findings (SLOT 4, port 4104)

Source: `e2e/test/scenarios/question/query-external.cy.spec.js` (50 lines)
Target: `e2e-playwright/tests/query-external.spec.ts`
Support: `e2e-playwright/support/query-external.ts` — **matches the target basename, NO deviation.**

## Collision checks

- `grep -rl "query-external" tests/ support/` → **no hits.** No prior port of this source.
- `ls tests/` → no `query-external.spec.ts`.
- `ls e2e/test/scenarios/question/` → `query-external.cy.spec.js` is the only file of that
  basename anywhere under `e2e/`. No `.ts` sibling.
- Many `question*` / `notebook*` ports exist; read and reused **read-only**
  (`support/notebook.ts`, `support/question-notebook.ts`). Nothing shared was edited.

## Which snapshot the `beforeEach` restores, and is db 2 the writable container?

The source builds two describes from a `supportedDatabases` table. Determined by **reading the
`beforeEach`**, not the `@external` tag:

| describe | snapshot restored | container |
|---|---|---|
| `can query Mongo database` | `mongo-5` | `metabase-e2e-mongo-sample-1` (:27004) |
| `can query MySQL database` | `mysql-8` | `metabase-e2e-mysql-sample-1` (:3304) |

**Genuinely container-backed — proven, not assumed** (see M3 below).

### `WRITABLE_DB_ID` is a MISNOMER here — db 2 is NOT writable under either snapshot

The source imports `WRITABLE_DB_ID` (literally `2`). Per `e2e/snapshot-creators/qa-db.cy.snap.js`,
`mongo-5` = `restore("default")` + `addMongoDatabase()` and `mysql-8` = `restore("default")` +
`addMySQLDatabase({})`. The writable variants are the **separate** `postgres-writable` /
`mysql-writable` snapshots (made by `convertToWritable`), which this spec never restores.

Verified at runtime on `name` and `details`, **not on the constant** — live probe against :4104:

```
after restore mongo-5 → db 2: "QA Mongo"   engine=mongo   conn-uri (mongo-sample)
after restore mysql-8 → db 2: "QA MySQL8"  engine=mysql   dbname="sample" port=3304
```

`dbname` is **`sample`**, never `writable_db`. Both databases are the **read-only QA sample**
warehouses. **The spec is read-only** (a single `SELECT`-shaped ad-hoc query, no writes), so it
cannot contribute debris to the shared containers and is unaffected by the ~30 debris schemas or
the `schemas[0] == Domestic` hazard — that hazard is **inapplicable**: the endpoint used is
`/api/database/:id/schema/` with an **empty** schema name, which is where both QA databases sync
their tables; no `schemas[0]` indexing occurs anywhere in this port.

## Gate mapping + gate-OFF control

Gate: `PW_QA_DB_ENABLED`, applied at **describe** level.
The describes have **no `afterEach`** (checked in the source, not assumed), so `beforeEach` would
also have been safe; describe level was used as it is unconditionally correct.

| run | result |
|---|---|
| gate ON (`PW_QA_DB_ENABLED=1`) | **2 passed** (Mongo, MySQL) |
| gate OFF (var unset) | **2 skipped**, 0 executed, 0 failed |

The difference is **exactly** the two gated tests, and they report as *skipped* rather than
*failed* — confirming the no-`afterEach` finding empirically.

## Absence assertions and their positive anchors

**NONE.** The source contains exactly one assertion (`cy.contains("37.65")`) and it is a
**positive-presence** assertion. The "zero-assertion satisfied on its first poll" hazard is
therefore **INAPPLICABLE** — I checked the mechanism (there is no `should("not.exist")`,
`toHaveCount(0)`, or equivalent anywhere in the spec), rather than merely not noticing one.

The presence assertion **is itself the container anchor**: `37.65` is a value from the QA
warehouse's ORDERS table, unreachable unless the external database actually answered the query.
M2 (below) confirms it is table-discriminating and not incidental page chrome.

## Port decisions

- `cy.intercept("POST","/api/dataset").as("dataset")` in the `beforeEach` is **dead** — never
  `cy.wait`ed, and `H.visualize()` (`e2e-notebook-helpers.ts:53`) re-registers the same alias and
  waits on its own. Dropped; the shared `visualize()` port carries the equivalent
  `waitForResponse`, registered **before** the click.
- `cy.request(".../schema/").as("schema")` is a **plain value alias, not a network queue**, so the
  "`cy.wait` pops past responses" hazard is inapplicable. Issued at point of use.
- `cy.contains("37.65")` → case-sensitive **substring**, innermost descendant, existence-only →
  `getByText(/37\.65/).first()` + `toBeAttached()`. Deliberately **not** `toBeVisible`
  (`.contains()` implies no visibility) and **not** `{exact:true}` (would be a strengthening).
- Virtualized-grid hazard **inapplicable**: 37.65 is the first ORDERS row's SUBTOTAL, well inside
  the ~18-row window, and it was found on the first poll (M1's timing proves the polls happened).

### Strengthenings (declared)

1. `openTableNotebookInDb` gates on the data step's `data-step-cell` being visible; upstream
   `visitQuestionAdhoc` returns `cy.wrap(null)` on the notebook path and gates on nothing. Load-
   bearing in Playwright, which would otherwise click Visualize before the foreign table's
   metadata resolves.
2. Added `expect(db.name).toBe(dbName)` — an identity check on database 2 that the source does not
   perform. `dbName` is declared but unread in the source's table; this puts it to work so a
   snapshot change can never silently turn this into a Sample-Database test. **M3 kills here.**

## FIXME (shared module defect — reported, not edited)

`support/ad-hoc-question.ts::openTable` routes `mode: "notebook"` through
`joins.openTableNotebook`, which **hardcodes `SAMPLE_DB_ID` and drops the `database` argument**.
Upstream `openTable` honours `database` in **both** modes. Calling the shared port here would have
silently built the ad-hoc query against the Sample Database with a foreign table id — the exact
port-drift failure mode. Worked around by reusing the existing read-only
`openTableNotebookInDb` (`support/question-notebook.ts`); a near-duplicate
`openTableNotebookInDatabase` also exists in `support/question-reproductions-1.ts`.
**Consolidate `openTable`'s notebook path to thread `database` through, then retire both.**

## Mutation testing

**Verifier sanity check performed BEFORE use** (per rule): each mutation target was grepped and
confirmed to occur **exactly once** (`37\.65` ×1, `"orders"` ×1, `snapshotName: "mongo-5"` ×1) —
non-zero, unambiguous, non-no-op. Baseline md5s recorded before the first edit; validated before
every write.

| # | Mutation (inverting the **input**) | Result | Dies at | Runtime tell |
|---|---|---|---|---|
| M1 | assert `37.66` (value cannot exist) | **KILLED** ×2 | line 138 (assertion) | 1.7s → **11.8s** |
| M2 | query table `people` instead of `orders` | **KILLED** ×2 | line 138 (assertion) | 1.1s → 11.2s |
| M3 | swap the two snapshots (mongo-5 ↔ mysql-8) | **KILLED** ×2 | **line 127** (db identity) | 1.1s → **0.2s** |

**No survivors.**

- **M1 is the answer to "is this green suspiciously fast?"** The 1.1–1.7s green looked implausible
  for restore + login + notebook + external query. M1 shows the runtime jumps to ~11.8s — exactly
  the ~10s assertion timeout — which proves the assertion **is live and polling**, and that the
  fast green means it resolved on the first poll rather than being skipped or short-circuited.
  The speed is legitimate: warm reused backend, small query.
- **M2 is partially over-determined and I am calling it out.** It dies at the **same line (138)**
  as M1, so it adds no new death site. It is not worthless — it proves the table lookup is load-
  bearing and that 37.65 comes from ORDERS rather than incidental chrome — but its kill is weaker
  evidence than the table alone suggests.
- **M3 aims at a different tail and lands there.** It dies at line 127 in **0.2s** (before any
  browser work), and its message is the direct runtime proof of the `WRITABLE_DB_ID` question:
  `Expected "QA Mongo", Received "QA MySQL8"` and vice versa. It establishes that `restore()` is
  load-bearing and that the snapshot → database-2 mapping is real.
- A mutation I considered and **rejected as bad**: pointing the query at the Sample Database
  (db 1). The Sample Database's ORDERS holds the **same** sample data as the QA warehouses, so
  37.65 would still render and the mutant would survive for an uninteresting reason — "the data
  cannot discriminate", not "the assertion is vacuous". M2 (different *table*) is the correct
  version of that probe.

**Both files restored byte-identical after every mutation — md5 re-verified against the recorded
baseline and matches** (`tests/query-external.spec.ts` `fc63e0fd6fb2515edebcb09ea07204a9`,
`support/query-external.ts` `d8fc4f1b99960e997ef05d15decc0571`).

## Containers before/after

**Untouched.** The spec only reads. Probe traffic was `GET /api/database/*` plus one
`POST /api/testing/restore/mysql-8` against **my own slot-4 app DB** (:4104, private `MB_DB_FILE`).
`docker ps` before and after unchanged: postgres-sample, mysql-sample, mongo-sample, maildev,
webhook-tester, ldap all Up. **Port 4000 never touched.**

## Verification

- Jar verified **by identity**: `ps` shows `java -jar .../target/uberjar/metabase.jar`;
  `version.properties` `hash=751c2a9` matches COMMIT-ID `751c2a98`. (Not by `JAR_PATH`.)
- Gate ON: **2 passed** (3.5s).
- `--repeat-each=3`: **6 passed** (7.6s), no flake.
- Gate OFF: **2 skipped**, as above.
- `bunx tsc --noEmit`: **clean for my files.** The single error reported
  (`tests/sandboxing-misconfiguration.spec.ts(57,3)`) belongs to a **concurrent slot's**
  in-progress untracked work (confirmed via `git status`), not this port.
- **Dead imports hand-audited** (tsc is silent on these): all 6 spec imports and the single
  support-module type import are referenced in their bodies. None dead.
- No snapshots regenerated. `PORTED.txt` / `QUEUE.md` / `playwright.config.ts` untouched. Nothing
  committed.

## Unexplained

Nothing. Every observation above is accounted for; no mechanism was invented to cover a gap.

## Summary

Clean 1:1 port of a 50-line spec: two container-backed tests (Mongo/`mongo-5`, MySQL/`mysql-8`),
both green and stable under `--repeat-each=3`, gated on `PW_QA_DB_ENABLED` with a clean gate-OFF
control showing exactly the two tests skipping.
`WRITABLE_DB_ID` is a misnomer in this spec — database 2 is the **read-only** QA warehouse
(`dbname=sample`) under both snapshots, verified on `name`/`details`, so the port writes nothing
and adds no shared-container debris.
Three mutations, all killed across two distinct death sites, including one that explains the
suspiciously fast green; one real shared-module defect found and reported (`openTable` drops
`database` on the notebook path) rather than edited.
