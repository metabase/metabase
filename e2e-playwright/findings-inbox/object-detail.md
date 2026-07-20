# object-detail (visualizations-tabular/object_detail.cy.spec.js → tests/object-detail.spec.ts)

Slot 5 / port 4105. Jar `target/uberjar/metabase.jar`, COMMIT-ID `751c2a98`,
backend reported `version.hash 751c2a9` — confirmed before every run.

## Collision checks

- Source dir `e2e/test/scenarios/visualizations-tabular/` has **no same-basename
  `.js`/`.ts` pair** for `object_detail`. The only `.ts` in that dir is
  `column-shortcuts.cy.spec.ts`, already ported. Confirmed I am porting
  `object_detail.cy.spec.js`.
- `ls tests/` — no `object-detail.spec.ts`. Near misses that are NOT this spec:
  `detail-view.spec.ts` (ports `detail-view/*`) and
  `detail-visualization-custom-column.spec.ts`. No collision.
- `QUEUE.md` line 12 lists the source as unported; PORTED.txt has no entry.
  (Not edited, per brief.)

## Infra tier — the classifier was RIGHT this time, but only for 6 of 33 cases

**MIXED, and the `@external` half is genuinely QA-DB.** This is the first
spec in my sample where the tag really does mean "needs a writable QA database",
so I want to be precise about the split rather than endorse the classifier
wholesale:

- **25 executable tests need no container at all.** Sample DB only
  (`mb.restore()` default), plus 2 upstream `it.skip`s.
- **6 tests are truly QA-DB.** `Object Detail > composite keys (postgres|mysql)`
  (2 tests × 2 dialects) and `Object Detail > no primary keys (postgres|mysql)`
  (1 test × 2 dialects) each `H.restore("${dialect}-writable")`,
  `H.resetTestTable` a table into `writable_db`, and `H.resyncDatabase` on
  `WRITABLE_DB_ID`. Not maildev, not mongo.

Everything those 6 need is present, so unlike `actions-on-dashboards` they are
**not** faithful-by-construction skips — they execute and pass:

- snapshots `e2e/snapshots/postgres_writable.sql` and `mysql_writable.sql` both
  exist;
- `metabase-e2e-postgres-sample-1` serves `writable_db` on :5404 and
  `metabase-e2e-mysql-sample-1` serves it on :3304 — i.e. the containers the
  brief listed as "postgres-sample"/"mysql-sample" are the *same* containers
  that host the writable DBs. Worth recording, because "postgres-writable isn't
  running" is an easy wrong inference from the container names.

## Container evidence (PORTING #85 — I touched `writable_db`)

Inspected before writing anything (`information_schema`, read-only):

```
postgres writable_db, BEFORE:
  Domestic|Animals, Schema A..Schema Z|Animals (26), Wild|Animals, Wild|Birds
  public|composite_pk_table, public|many_data_types          → 31 rows, 29 debris
mysql writable_db, BEFORE:
  writable_db|composite_pk_table, writable_db|no_pk_table
```

Consequences handled:

- The 28 foreign postgres schemas are **live sibling debris — not dropped.**
- `H.getTableId({ name })` is unpinned upstream. The postgres leg pins
  `schema: "public"`; mysql's `writable_db` has a single schema so its lookup
  stays unpinned (pinning it would have to hardcode the database name, which is
  not what the picker/API reports consistently across dialects).
- This spec navigates by **URL** (`/question#?db=2&table=<id>`), never through
  the table picker, so the virtualized-picker hazard (#85's sharpest symptom)
  does not apply here. Recording that as *why* it was safe, not as evidence the
  container is clean — it isn't.
- AFTER the runs, postgres gained `public.no_pk_table` (this spec creates it;
  it did not exist before). No foreign schema touched. mysql unchanged in
  shape.

`resetTestTable` writes are confined to `public`/`writable_db`, and both tables
are dropped-and-recreated by this spec's own `beforeEach`, so a sibling reading
either name races us — same exposure every writable-DB spec already has.

## Executed vs gate-skipped

| run | gate | result |
| --- | --- | --- |
| 1 | `PW_QA_DB_ENABLED=1` | **31 passed, 2 skipped** (49.4s) |
| 2 | gate OFF (control) | **25 passed, 8 skipped** (36.7s) |
| 3 | gate ON, `--repeat-each=2` | **62 passed, 4 skipped** (1.8m) |

The 2 always-skipped are upstream's own `it.skip`s. The gate-off delta is
exactly the 6 `@external` tests. **No `afterEach` exists**, so the
gate-off-control failure mode (PORTING: "48 failed instead of 48 skipped") could
not fire here — but the control still earned its place by confirming the gate
partitions the file exactly 6/25 rather than, say, silently skipping a describe
I thought was running.

## Fixmes

**None.** 0 `test.fixme`, 0 weakened assertions, 0 dropped tests. The two
upstream `it.skip`s are ported as declared-skipped `test.skip(...)` with their
bodies intact.

## tsc

`bunx tsc --noEmit` from `e2e-playwright/`: **clean, zero errors** — including
the 4 pre-existing `transforms.spec.ts` errors the brief warned about, which
were gone by the time I ran (a sibling presumably fixed them). Nothing of mine.

## Mutation testing

Eight mutants, all inverting the **input**. Recorded with *where* each died,
since the brief's warning about everything dying at assertion #1 turned out to
apply to one of them.

| # | mutation (input) | target | outcome | died at |
| --- | --- | --- | --- | --- |
| M1 | `composite_pk_table` row 6 `name: "Rabbit"` → `"Bunny"`, **in the shared writable container** | composite-keys ×2 dialects | **killed** | the `"Rabbit"` heading (`:1190`) |
| M2 | `SECOND_ORDER_ID` 10874 → 10875 | browsing by PKs | **killed** | the **2nd** `assertOrderDetailView`, not the 1st |
| M3 | passive counter's path `/api/action` → `/api/database` (presence probe) | #50266 | **killed** — counter saw **3** | `expect(getActionsCallCount).toBe(0)` |
| M5 | dnd-kit reorder `vertical: -300` → `0` | viz-settings column order | **killed** | `indexOf("State") = 1`, not `< indexOf("Email")` |
| M6 | add `PEOPLE.ID` to the "no primary keys" fields (questions **and** models legs) | WRK-900 ×2 | **killed** | absence assertion **#1** (`Copy link to this record`) |
| M6-tail | M6 **plus** stepping past the two assertions that abort first | WRK-900 | **killed** | `/is connected to/` → count 1 |
| M7 | `scrollTop` 14900 → 0 | #51301 | **killed** | `openObjectDetail(417)` — row 417 never renders |
| M8 | `scrollLeft` 2000 → 0 | #51301 | **SURVIVED** | — |

Notes on the two interesting ones:

**M1 is the strongest result here.** It corrupts one row in `writable_db` that
only *one* of the four composite-key tests asserts on. The two
"can show object detail modal" tests (which read Duck/Horse) stayed green while
both "cannot navigate past the end" tests (which read Rabbit) went red, on both
dialects. That discrimination is what proves the QA-DB half is real end to end:
`resetTestTable` genuinely writes into the container, the schema-pinned
`getTableId` finds *that* table rather than a debris same-named one, and the
app renders the row I mutated. Without this, "6 QA tests passed" would have been
a claim about the harness, not about the tests.

**M6 is the "check WHERE it died" case.** It killed at the first absence
assertion, leaving the actual WRK-900 subject — "no relationships when there is
no PK" — unproven. The follow-up (M6-tail) reached it and killed there too, so
both halves are load-bearing. Worth repeating that the first mutant alone would
have been misleading.

### M8 survived — measured, and I checked it is not port drift

`#51301` is titled "calculates a row after **both vertical and horizontal**
scrolling correctly". Neutralising the horizontal scroll alone leaves the test
green.

Before reporting that as vacuity I ruled out the obvious alternative — that my
port never scrolled horizontally in the first place (PORTING notes
react-virtualized `ScrollSync` grids ignoring a synthetic `scrollLeft`). Probed
the container immediately after the assignment:

```
SCROLL-PROBE {"left":610,"top":14900}
```

So `scrollLeft = 2000` **did** apply and clamped to 610, which is the
container's maximum — i.e. the table really is scrolled fully right in the
unmutated run, and fully left under M8. The two states are genuinely different
and the assertions cannot tell them apart.

**Stated precisely, separating measured from inferred:**
- *Measured*: with `scrollLeft` 610 vs 0 and everything else identical, the
  three `dialog` assertions (`418`, the address, the email) pass identically.
  The horizontal component contributes nothing to what this test asserts.
- *Measured*: `scrollTop` **is** load-bearing — M7 (`scrollTop → 0`) killed the
  test at `openObjectDetail(417)`, because row 417 isn't rendered unscrolled.
- *Not established*: whether the original #51301 regression required the
  horizontal scroll to reproduce. I did not find or run the pre-fix build. So I
  am **not** claiming the upstream test is worthless — only that half of its
  stated subject is unexercised by its assertions **on the current build**.
  Cypress has byte-identical assertions, so if this is vacuity it is vacuity
  upstream, not port drift.

Ported verbatim with this analysis inline, per the faithfulness rule.

### What mutation could NOT prove

The tail of "handles browsing records by PKs" — the two *backward* navigations —
re-asserts ids already proven present by the forward pass, so no fixture
mutation can isolate it. That is a property of how the upstream test is
constructed, not a gap in the port. Recording it rather than implying full
coverage.

## Brief claims that did / didn't reproduce

- **`[data-index=0]` is invalid CSS** — reproduced, quoted it.
- **Rows render once per horizontal quadrant** — reproduced. `[data-index="N"]`
  matches 2 nodes; only one carries `detail-shortcut`. Handled with a
  `filter({ has: detail-shortcut })` for the interaction paths and `.first()`
  for the `have.css` assertions (which are first-element semantics in
  chai-jquery anyway, so `.first()` is the *faithful* port here, not a
  defensive one).
- **`click({force:true})` is not Cypress's `{force:true}`** — did not need to
  arbitrate; the shared `openObjectDetail` already force-clicks and it works.
- **The hover-gated inversion (re-hover before acting)** — I pre-emptively
  re-hovered before the sidebar-toggle click. Not proven necessary; recording it
  as *inferred*, not measured.
- **`QuestionDisplayToggle` needs `click({force:true})`** — **did not
  reproduce for this spec.** Upstream's `view-footer` → `"Visualization"` click
  in #54317 is the *chart-type* button, a different control from the
  data/visualization SegmentedControl the rule is about; a plain `click()`
  works. Flagging so the rule isn't over-applied to every "Visualization" text
  in the view footer.

## Container evidence, after the runs

```
postgres writable_db AFTER: public.{composite_pk_table, many_data_types, no_pk_table}
                            + Wild.Birds + 28 foreign schemas' Animals  (unchanged)
distinct foreign schemas: 28   ← same as before, nothing dropped
mysql writable_db AFTER:   composite_pk_table, no_pk_table
```

Net effect of this spec on the shared container: `public.no_pk_table` now
exists in postgres where it did not before. No foreign schema touched.

## Summary (3 lines)

Ported all 26 upstream tests (33 Playwright cases after the ×2 dialect loop),
green 31/31 executable first run and 62/62 under `--repeat-each=2`, with zero
fixmes and clean `tsc`. The infra tier is **mixed, not wholesale QA-DB**: 25
tests need no container, and the 6 genuinely-`@external` ones really execute
here because the postgres/mysql "sample" containers also host `writable_db` and
both `*_writable` snapshots exist. Seven of eight mutants died — including a
container-fixture mutant that discriminated between two pairs of QA-DB tests,
which is what makes the writable-DB half trustworthy — while the surviving one
shows `#51301`'s horizontal-scroll half is unexercised by its own assertions
(measured, and confirmed not to be port drift).
