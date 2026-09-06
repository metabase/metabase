# Notes: local parallelism, the sample DB, and a read-only test pool

Captured 2026-07-18 from a side investigation (prompted by "we're moving the
sample DB off H2 — does that change parallelism, and could we split read-only
tests?"). Reference for when the sample-DB change actually lands.

## What forces per-worker isolation

Two H2 databases, very different roles:
- **App DB** (`metabase.db`) — Metabase's own state (dashboards, questions,
  users, settings, search index). `restore()` wipes and rewrites it. **This is
  the fundamental reason each worker needs its own backend** — shared app state
  means tests clobber each other.
- **Sample DB** (`sample-database.db`) — read-only queryable demo data. Snapshots
  pin it to a shared H2 file; H2's single-writer lock is why we need per-worker
  copies + repoint-after-restore (and the source of the #22 lock-contention
  retraction confusion).

**The parallelism ceiling is the per-worker JVM (RAM-bound), not the sample DB.**
Moving the sample DB off H2 removes the copy/repoint machinery and kills the
lock-flake class — a real simplification — but each worker still needs its own
Metabase JVM for app-state isolation, so the "how many workers locally" answer
stays RAM/JVM-bound. Budget by RAM and backend count, not cores.

## Could we split read-only tests into a shared-backend pool?

A shared sample DB is the *prerequisite* that makes a "Tier 0" shared-read pool
possible (before, even read-only tests fought the sample H2 lock). Shape:
- **Tier 0 — shared, read-only:** no `restore()`, no app-state writes → one
  shared backend + shared sample DB, high worker count (bounded by CPU/browser
  contexts, not JVM RAM). Near-free parallelism.
- **Tier 1 — isolated:** anything that `restore()`s or mutates → per-worker
  backends (current model). Playwright "projects" model this cleanly.

## How big could Tier 0 actually be? (measured, heuristic, spec-level)

Across the 73 ported specs (~1,030 tests) at the time:

| Bucket | Tests | Share |
|---|---|---|
| Body-mutation → must stay isolated (Tier 1) | ~777 | **~75%** |
| Setup-mutation only → Tier 0 *if seeded* | ~151 | **~15%** |
| Pure read → Tier 0 *now* | ~103 | **~10%** |

So ~10% could share a backend today; seeding the setup-created fixtures could
lift it to ~25%. **~75% genuinely write app state during the test** (save
dashboards/questions, change settings, admin/permissions, archive) — seeding
can't help those. Method caveats: spec-level grep, so it under-counts Tier 0
(mutating specs contain some read-only tests) and over-counts the seedable
bucket (e.g. `documents-comments` creates docs in setup but then *comments*, a
body mutation the regex missed). The shape — ~¾ mutate — is robust.

## Why tests API-create fixtures instead of UI-creating or seeding

- **Not UI-creation** (even though it'd be "more e2e"): deliberate
  arrange-via-API / act-via-UI split. UI-building every fixture is slow ×1,000
  tests, couples every dashboard/filter/viz test to the question-builder (a QB
  change breaks hundreds of unrelated tests), and is flakier. UI-creation is
  reserved for tests whose *subject* is creation.
- **Not seeded**: seeded fixtures are shared global state — tests lose their
  clean slate, "tree has N items" assertions get fragile, mystery data appears,
  and fixtures drift from what each test needs. Per-test creation is explicit,
  co-located, isolated. **The cost of that choice is exactly the mutation that
  forces `restore()` + per-worker isolation** — i.e. it's why Tier 0 is small.

## ROI

The sample-DB-off-H2 change is worth doing on its own (simpler harness, no
lock-flake). A seed + Tier-0 pool on top buys a shared fast lane for ~25% of
tests *at best*, at the cost of seeding coupling for the 15% converted, while
75% still need a JVM per worker. Net: modest. If pursued, the sharp version is
**seed a small canonical fixture set** (a few standard questions/dashboards over
the shared sample DB) shared by the pure-read + setup-only specs in a
high-concurrency project — only if the wall-clock math on that ~25% justifies
two-tier complexity. Ranked below the CI-build wins (uberjar reuse / snapshots-
once) for bang-for-buck.

## The bigger lever (out of scope of "just sample DB")

If the *app* DB ever moves to Postgres too: `CREATE DATABASE ... TEMPLATE` to
fast-clone a seeded app DB per worker, or per-test transaction rollback instead
of full `restore()`. That's where the JVM/`restore()` ceiling actually moves.

_Regenerate the tier numbers with `scripts/`-style grep or the ad-hoc script in
the session scratchpad; they'll shift as more specs land._
