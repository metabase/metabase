# DatasetStore — a narrow port onto DWH test datasets

Status: **draft for iteration.** Implementation deliberately out of scope. This document is about
usage patterns, method inventory, and semantics only.

Design frame: `~/.claude/GOOS.md`. Module boundary is drawn around the **side-effecting area**
(datasets living on a remote DWH), not around any existing Metabase namespace. The incumbent
`metabase.test.data.*` system is treated as an **external, side-effecting system**; `DatasetStore`
is the narrow set of operations our code actually needs from it.

---

## 1. Motivation — the incumbent's failure is already documented in its own source

Two of the three cloud reapers are **commented out in production code**, and the reason is exactly
the race this protocol is designed to eliminate.

`modules/drivers/snowflake/test/metabase/test/data/snowflake.clj:308`, where the call to
`drop-old-datasets!` sits commented out:

> disabling this temporarily as it has caused very difficult-to-debug failures in CI. even tho the
> datasets *have* been accessed recently, they are still being deleted and reinserted, with race
> conditions that cause some data to be inserted three times.

BigQuery's is disabled the same way —
`modules/drivers/bigquery-cloud-sdk/test/metabase/test/data/bigquery_cloud_sdk.clj:591` reads
`(comment (delete-old-datasets-if-needed!))`, above it:

> re-enable this again once things are stable; for now let's just completely excise this potential
> source of unreliability

The CI project has since accumulated ~3.4k datasets, and enumerating them takes ~18s, which blows
the 5s `can-connect?` timeout. See `[[project_bigquery_ci_dataset_bloat]]`.

The very next lines of that same function are the TOCTOU in its clearest form:

```clojure
(when-not (database-exists?! db-def)
  (create-dataset! dataset-id))
```

**The causal chain:** listing and deleting are fused into one operation that has no way to observe
that a dataset is *mid-load* by another CI job. So the reaper deletes live datasets. The fix was to
disable the reaper. Disabling the reaper causes unbounded growth. Unbounded growth causes the
enumeration timeouts. Neither `delete-expired-datasets!` nor a per-JVM lock can break that loop.

Three structural defects produce it:

1. **Existence and creation are separate calls.** `tx/dataset-already-loaded?` then `tx/create-db!`
   is a TOCTOU window with no claim in between.
2. **The only mutual exclusion is in-process.** `get-or-create/dataset-lock` is a
   `ReentrantReadWriteLock` per `[driver dataset-name]` held in a `defonce` atom. It is invisible to
   every other JVM — and cross-job concurrency is where the damage actually happens.
3. **Deletion has no notion of "in use".** `destroy-db!`'s own docstring says it is only called to
   roll back a failed load, but `impl/drop-dataset!` and every reaper call it as a general delete.
   The contract does not describe the usage.

---

## 2. What the incumbent actually does today

Inventory taken from `test/metabase/test/data/interface.clj`, `impl/get_or_create.clj`, and the
per-driver test-data namespaces for BigQuery, Snowflake, Redshift, Athena, Databricks.

### Operations on the DWH

| Today | Where |
|---|---|
| create container + tables + load rows | `tx/create-db!` |
| does it exist? | `tx/dataset-already-loaded?` |
| drop it | `tx/destroy-db!`, `destroy-dataset!`, `DROP DATABASE/SCHEMA … CASCADE` |
| record a use | `tx/track-dataset` → `MERGE` into `metabase_test_tracking.datasets` on the DWH |
| enumerate all | `INFORMATION_SCHEMA.SCHEMATA` (BQ), `SHOW …` (Snowflake), `fetch-schemas` (Redshift), `existing-databases` (Athena, Databricks) |
| enumerate stale-by-use | `accessed_at < now() - interval` against the tracking table |
| enumerate stale-by-age | `name like 'sha_%' and creation_time < …` for rows *absent* from the tracking table |
| enumerate live set | Redshift re-snapshots schemas after dropping, to decide which iso users are safe |
| session setup/teardown | `tx/before-run` / `tx/after-run` |

### Conflations to break apart

`tx/create-db!` performs container creation, table DDL, row loading, and role grants as one
indivisible act. `get-or-create-database!` wraps that with app-DB `:model/Database` insertion, sync,
permission setup, and FK fixups. None of the second group belongs behind a DWH port.

### Explicitly a different store

Users, roles, service accounts, cache schemas, and persisted-model schemas are swept by the same
reaper functions today, but they are not datasets. They share a *policy* (prefix + age), not a
*capability*. Keeping them out is what stops `DatasetStore` from becoming the next god-interface.

### The team already wants this

`interface.clj:105`, directly above `get-dataset-definition`:

```clojure
;; TODO - this should probably be a protocol instead
;; Tech debt issue: #39350
```

### Where identity comes from

Names are content hashes today — `tx/hash-dataset*` produces `sha_<hash>` / `sha_rel_<hash>`.
**That is naming policy and belongs to the caller, not the store.** The store takes an opaque
dataset id. This is a real decoupling win: it makes the gold/work split in
`[[project_bq_test_infra_plan]]` a caller-side naming decision rather than a store change.

---

## 3. Proposed protocol

Five methods. Every one is justified by ≥2 real call sites in §4.

```clojure
(defprotocol DatasetStore
  "Datasets that live on a remote data warehouse, addressed by opaque id.

   Every method is assumed atomic from the caller's perspective. No method retries,
   waits, polls, or batches — those compose on top."

  (create-dataset! [store dataset-id dbdef]
    "Idempotently create the dataset named by `dataset-id` with contents `dbdef`,
     a `metabase.test.data.interface/DatabaseDefinition`.
     Returns:
       :created     — this call did the work; the dataset is now :ready
       :exists      — already present and :ready; this call did nothing
       :in-progress — another agent holds the claim; this call did nothing")

  (delete-dataset! [store dataset-id]
    "Delete the dataset named by `dataset-id`.
     Returns:
       :deleted     — it existed and is now gone
       :absent      — it did not exist; this call did nothing
       :in-progress — another agent holds the claim; this call did NOT delete it")

  (describe-dataset [store dataset-id]
    "Return a descriptor map, or nil if no such dataset.
     {:id, :state, :created-at}
     :state is :ready or :loading.")

  (list-datasets [store criteria]
    "Return descriptor maps for datasets matching `criteria`, a map of constraints.
     `{}` means all. The store may push criteria down to the warehouse or apply
     them locally; the result is the same either way.")

  (create-temp-isolated-dataset! [store dbdef]
    "Materialize `dbdef` as a brand new dataset no other caller shares; return its id.
     No claim and no idempotence -- the id is freshly minted. The caller owns the
     result and is expected to delete it; see `with-temp-dataset`."))
```

### Semantics that need to be nailed down

**`:in-progress` is the whole point.** It is what lets a reaper enumerate and delete without ever
racing a loader. `delete-dataset!` returning `:in-progress` rather than deleting is the direct fix
for the disabled-Snowflake-reaper bug. Symmetry with `create-dataset!` is not decoration — both
methods need the same claim to be correct.

**A stale claim is reclaimed by `create-dataset!`, not by the caller.** A crashed loader leaves a
claim nobody will release. From outside, a stale claim is indistinguishable from an active load — so
the caller is never asked to make that judgment. `create-dataset!` **must steal a claim whose lease
has expired**, using the same compare-and-set it uses to acquire a free one, so that concurrent
waiters produce exactly one winner. A waiter therefore only ever retries; it never decides that an
owner is dead. See Q2 for the lease TTL and the atomic-publish obligation that makes stealing safe.

**Criteria are data, not predicates.** `{:name-prefix "sha_" :created-before t :state :ready}`. A predicate function would force full enumeration — which is the 18s/3.4k-dataset
problem. Criteria-as-data lets an adapter push a filter into SQL while keeping one method and
letting callers compose freely. Callers that want arbitrary logic can still
`(filter pred (list-datasets store {}))`.

**Singular delete.** `delete-datasets!` plural is a batching concern; DWH batch drops are not atomic
anyway. Compose with `run!`. Revisit only if measurement demands it.

### Deliberately NOT in the protocol

Retry / await / poll-until-ready · reaping policy · batch delete · content hashing and naming · app-DB
`:model/Database` creation, sync, permissions, FK fixups · users, roles, service accounts ·
table-level operations.

Each of these composes over the five methods. Reaping, for instance, is not a method — it is
`list-datasets` → filter → `delete-dataset!`, and the `:in-progress` return makes it safe by
construction.

---

## 4. Outside-in validation — every current caller, re-expressed

| # | Call site today | In the new protocol |
|---|---|---|
| 1 | `get-or-create/load-dataset-data-if-needed!` | `create-dataset!`, wrapped in an await decorator that loops on `:in-progress` |
| 2 | `create-database!` rollback on load failure | `delete-dataset!` |
| 3 | `impl/drop-dataset!` (REPL / `clojure -X`) | `delete-dataset!` |
| 4 | `impl/test-drop-dataset` (verifies before + after) | `describe-dataset` → `delete-dataset!` → `describe-dataset` |
| 5 | BigQuery `delete-old-datasets!` | `list-datasets {:id-prefix id-prefix :created-before t}` → `delete-dataset!` each |
| 6 | Snowflake `drop-old-datasets!` (disabled) | same as #5 — and re-enableable, because `:in-progress` blocks the delete that broke it |
| 7 | Redshift `delete-old-schemas!` two-phase live re-snapshot | `list-datasets` → delete → `list-datasets` again |
| 8 | `tx/track-dataset` | *gone* — nothing records use; see Q5 |
| 9 | `tx/dataset-already-loaded?` | `describe-dataset` → `:state = :ready` |
| 10 | Redshift session schema `before-run`/`after-run` | `create-dataset!` / `delete-dataset!` with a session-scoped id |

`describe-dataset` earns its place from #4 and #9; `list-datasets` from #5, #6, #7. No method is
speculative.

---

## 5. Decisions

All four resolved. Recorded with their reasoning rather than deleted, so the doc stays legible as
it iterates.

**Q1 — What does `create-dataset!` take? — DECIDED: a `DatabaseDefinition`.**

The alternative considered was a loader fn (`(create-dataset! store id load-fn)`), which would have
kept the store ignorant of Metabase entirely but put an arbitrary long-running callback inside the
claim's lease. Rejected in favour of the clearer contract.

This is not a leak. `DatabaseDefinition` is a `p.types/defrecord+` of
`[database-name table-definitions options]` validated by a closed Malli schema
(`ValidDatabaseDefinition`, `interface.clj:107`) — pure data, no connections, no handles, no
behaviour. **A value type crossing a port is normal and correct;** what must never cross is a
service or an ambient handle. GOOS calls this budding off, and the record already is one.

Two consequences worth stating in the contract:

- **The store does not verify that `dbdef` matches `dataset-id`.** Idempotence is decided purely on
  id — "an entry with this id exists and is `:ready`" yields `:exists`. Correspondence between id
  and content is the caller's naming policy, which already exists as `tx/hash-dataset*`. If a caller
  hands the same id two different dbdefs, that is a caller bug, and the store is not the place to
  catch it.
- **The legacy adapter becomes a near-identity mapping.** `tx/create-db!` already takes a dbdef, so
  `LegacyTxDatasetStore` delegates without translation. That materially lowers the cost of step 2 in
  §6.

**Q2 — Does `:state` need `:failed`? — DECIDED: no.**

Acid test: *does a consumer make a decision based on `:failed`?* It does not. A waiter that finds a
dead owner wants to take over — and takeover belongs **inside `create-dataset!`**, not in the
caller:

```clojure
(loop []
  (case (create-dataset! store id dbdef)
    (:created :exists) :done
    :in-progress       (do (wait) (recur))))
```

When the lease has expired, `create-dataset!` steals the claim and does the work, returning
`:created`. The waiter never learns that a failure happened. The coordination requirement — only one
of several waiters wins — is satisfied by the *same compare-and-set* the normal acquisition path
already needs. Stealing an expired lease and acquiring a free one are one primitive.

This also rules out exposing `:claimed-at` for callers to threshold on (an earlier draft of this
document proposed exactly that). Publishing the claim's age invites callers to decide liveness
themselves and then act on it outside the store, which is the race the sentinel exists to remove.
**The liveness threshold must live where the atomic action lives.**

### Lease semantics that follow

**Lease TTL ≤ 5 minutes.** Most dataset creations finish in ≤30s. The lease is *not* the same knob
as the client timeout: `create-database-timeout-ms` (30 min, "Redshift is slow") governs how long a
caller is willing to keep working; the lease governs how long its claim is respected unrenewed.
Independent settings.

**Takeover is only safe if a stolen lease cannot corrupt data.** A 5-minute lease against a
30-minute client timeout means a live-but-slow loader *can* be stolen from — two loaders writing the
same dataset, which is the Snowflake triple-insert bug arriving through a different door. Three
resolutions:

- **Atomic publish** — the loader writes where nothing can observe it and flips a `ready` marker at
  the end. A stolen lease then costs duplicated work, never corruption. Already the design in
  `[[project_bq_test_infra_plan]]` (`state=ready` label on gold datasets).
- **Lease renewal** — the owner extends while working; a dead owner stops. Safe, but it is heartbeat
  machinery in every adapter.
- **Per-driver TTL** — simplest, but a guess, and it restores long waits for slow drivers.

Atomic publish is the recommended route, which makes this a **contract obligation on adapters:
writes must not be observable until the dataset is `:ready`.** Renewal is the fallback for any
warehouse that cannot publish atomically.

**Q3 — Is a session container a dataset? — DECIDED: no. It is a different role.**

Survey first, because "session schema" currently names three unrelated things:

1. **Fixed location, not session-scoped at all** — h2 `PUBLIC`, postgres `public`, clickhouse
   `default`, snowflake `PUBLIC`, bigquery `(get-test-data-name)`. `sql.tx/session-schema` here only
   answers "which schema do test tables live in". Nothing is created or destroyed. Misnamed.
2. **Fixed name, wiped per run** — Oracle alone. `(defonce session-schema "mb_test")` is a constant;
   `before-run` drops and recreates the user. The name is shared, so concurrent runs would clobber
   each other.
3. **Genuinely private per process** — Redshift's `unique-session-schema`
   (`<utc-date>_<hour>_<site-uuid>_schema`), and Snowflake in CI, where `qualified-db-name` yields
   `isolate_<dataset-prefix>_<name>` with `(defonce dataset-prefix (str (rand-int 9999999)))`.
   Snowflake uses the shared content-addressed `sha_<hash>_<name>` path when `GITHUB_REF_NAME` is
   unset, i.e. locally.

Note also that `before-run`/`after-run` are a grab-bag hook, not a container concept: Vertica uses
`before-run` for `CLOSE_ALL_SESSIONS()` and `MaxClientSessions`; Starburst uses it to
`alter-var-root` a test var. **This port replaces only part of what those hooks do.**

### Why they are different roles

Kind 3 exists *because the claim does not*. From `unique_prefix.clj`'s own docstring:

> In the past we had one shared prefix for everybody, and everybody was expected to play nice […]
> one CI job would […] see that a dataset did not exist, and try to recreate it, and then another CI
> job would do the same thing at the same time, and eventually we'd end up with a half-created
> dataset that was missing a bunch of rows.

That is precisely the TOCTOU this protocol removes. Per-run namespacing is the workaround for a
missing coordination primitive, and its cost is that nothing is ever shared — every run rebuilds
everything, which feeds the bloat in `[[project_bigquery_ci_dataset_bloat]]`.

|  | Dataset | Private workspace |
|---|---|---|
| Naming | content-addressed `sha_<hash>` | random / uuid, per process |
| Shared | across runs | never |
| Exclusivity from | **a claim** | the name itself |
| Reaped by | age since last use | end of run |

A private workspace needs no claim because nobody else can name it — so `create-dataset!`'s
idempotence and `:in-progress` are both meaningless for it. Shape matches,
contract does not. Same split as gold/work in `[[project_bq_test_infra_plan]]`.

**Consequence worth chasing later:** if the claim works, Snowflake's CI `isolate_` branch can
collapse back onto the shared `sha_` path. That is where the rebuild cost actually goes away.

**Q4 — Where does the claim live? — DECIDED: the protocol does not say. Adapters own it.**

The protocol states the *guarantee*; each implementation provides it with whatever its warehouse
offers — a tracking table, a dataset label, a transactional upsert, an advisory lock. The one
requirement the contract does make is that the claim be **observable by other processes**, because a
lease another process must steal atomically cannot live in a `defonce` atom.

**A warehouse lacking a tracking table today is not an exemption; it is an implementation task.**
BigQuery and Snowflake already have `metabase_test_tracking.datasets`; Redshift, Athena, and
Databricks do not. All of them are databases. Coordinating a write is the thing a database does.

This is also why there is **no `LegacyTxDatasetStore`.** An adapter that returns only
`:created`/`:exists` because the incumbent cannot claim does not implement a weaker version of this
protocol — it satisfies the signature while dropping the guarantee, which is exactly the failure
mode the design exists to prevent. The test double is instead an **in-memory `DatasetStore`
implementing the full contract, `:in-progress` included** — a real fake, not a lobotomised delegate.

**Q5 — Should a dataset record when it was used? — DECIDED: no.**

Reaping is by age since creation, and nothing tracks use.

What makes this safe is content-addressing: a dataset's id is a hash of its contents, so deleting
one is never *wrong*, only wasteful. The next caller recreates exactly the same dataset, and the
claim means only one of them does the work. A reaper that is too eager costs duplicated effort, not
corruption and not a wrong test result.

Against that, recording use is the most frequent write a store makes -- one per dataset per process,
in every process, all landing on one table. It is what drove BigQuery's 20-queued-DML-per-table
limit and the `recently-tracked-hashes` debounce built to dodge it. Removing it deletes that whole
class of problem along with a protocol method, a column, a decorator behaviour, and two criteria.

The two lifetimes it leaves:

- **Shared datasets** live a long time and are rebuilt if anything removes them.
- **Temp datasets** are reaped a fixed interval after *creation* -- an hour or two, matching how long
  a test that made one could plausibly still be running. `with-temp-dataset` deletes them
  immediately anyway; the interval is only a backstop for a run that died.

Cost accepted: nothing can answer "which datasets are actually in use". If that is ever needed, it
is a query-log question, not a reason to write on every dataset load.

**Q6 — Is `tx/destroy-db!` part of the port? — DECIDED: yes.**

It has to be. `create-dataset!` and `delete-dataset!` are the only two operations that may touch a
dataset, and a `tx/destroy-db!` that drops the physical thing directly leaves a tracking row saying
`ready` for a dataset that is gone — which the next caller believes, because believing the tracking
table is the whole point of it.

The three store drivers' `tx/destroy-db!` now resolve their store and call
[[metabase.test.data.dataset-store/delete-dbdef!]]. That helper re-derives the dataset id from the
definition, because `destroy-db!`'s callers hold a definition and nothing else — they run in a test's
`finally`, far from the rename in `default-get-or-create-database!`.

Two consequences worth writing down:

- Snowflake's `(throw (Exception. "tried to delete test-data"))` guard is **gone**. Under
  content-addressing, deleting the shared dataset is safe — the next caller rebuilds it exactly, and
  the claim means one of them does the work. Dropping it *outside* the store was the unsafe part,
  and that is what changed. `date_bucketing_test` depends on being able to delete and rebuild a
  shared dataset when its time-relative data goes stale.
- `tx/create-db!` is **not** routed through the store, so the two doors are not symmetric. Checked
  rather than assumed: no store driver reaches a direct `tx/create-db!` call site today
  (`::field-comments-sync` is h2/postgres/starburst; Redshift declares no `:actions`; Snowflake and
  BigQuery set `:test/dynamic-dataset-loading` to false). Routing it too would mean extracting
  BigQuery's loading body, since its adapter calls `tx/create-db!` polymorphically and would recurse.
  Worth doing the day a store driver needs one; not worth it on unverifiable ground now.

**Temp datasets are named, not minted, when they come in through a definition.**
[[metabase.test.data.interface/temp-database-definition]] marks a definition as belonging to one
test. `dataset-id-dbdef` then gives it [[temp-id-prefix]] while keeping it content-addressed, so the
`finally` that holds only the definition can still name the dataset to delete. Uniqueness comes from
the random suffix the mark also adds — which is what those callers were already doing by hand.

`create-temp-isolated-dataset!` keeps minting its own id, for the direct `with-temp-dataset` path
where no `:model/Database` is involved. BigQuery reads the expiry off the id prefix rather than off
which method created the dataset, so both paths get the backstop.

---

## 5b. What must melt away

Acceptance criteria. Each of these exists only to paper over the missing coordination primitive; if
they are still here at the end, the primitive is not doing its job.

| Bandaid | Where | Status |
|---|---|---|
| `unique-prefix` / `unique-session-schema` per-instance-per-hour namespacing | `test_util/unique_prefix.clj`, `redshift.clj:66` | **Partly.** No dataset is named through it any more. `unique-session-schema` survives as this run's *scratch* schema, which upload and transform tests create tables in — a real need, not coordination. |
| Snowflake's CI-only `isolate_<rand-int>` branch, `(defonce dataset-prefix (rand-int 9999999))`, and the `already-qualified?` special case | `snowflake.clj` | **Gone.** `already-qualified?` now recognises only the store's own prefix. |
| Snowflake `after-run` sweeping `isolate_%` | `snowflake.clj` | **Gone**, along with the names it swept. |
| `DROP SCHEMA IF EXISTS … CASCADE` before `CREATE SCHEMA` — defensive against a leaked previous run | `redshift.clj` | **Stands.** It guards the scratch schema, which is still per-run and still leakable. |
| `dataset-lock` / `dataset-locks` — in-process `ReentrantReadWriteLock`, invisible to the jobs that actually collide | `get_or_create.clj:30,36` | **Stands.** Now redundant for store drivers — the claim is the real lock — but it still serves every other driver. |
| `deleted-old-datasets?` / `deleted-old-test-data?` once-per-process CAS guards | `bigquery_cloud_sdk.clj`, `snowflake.clj` | **Gone**, with the reapers they guarded. |
| `session-init-time` + `reload-data-if-needed!` comparing `:created_at` against process start | `get_or_create.clj:33` | **Stands**, for the same reason as `dataset-lock`. |
| `tx/dataset-already-loaded?` as a separate call — the TOCTOU's other half | `interface.clj` | **Gone for all three store drivers.** The multimethod remains for drivers that have no store; `create-dataset!` answers the question and acts on the answer atomically. |
| `tx/track-dataset` + `tx/tracking-access-note` — the "record a use" extension point | `interface.clj`, `get_or_create.clj:431` | **Gone entirely.** With Q5 no driver implemented it, so every call hit an inert default. Removed along with its one call site. |
| Both commented-out reapers | `snowflake.clj`, `bigquery_cloud_sdk.clj` | **Deleted, not revived.** Age-based reaping is deliberately a separate body of work; see Q5 and Q6. |
| BigQuery's `recently-tracked-hashes` debounce | `bigquery_cloud_sdk.clj` | **Gone.** It existed to make a per-use write affordable; Q5 removed the write. |

Still standing, and the biggest one left:

| `:test/dynamic-dataset-loading` forced to `false` for Snowflake ("too much contention here causing
unreliable tests") and BigQuery. This is the plainest statement in the tree that dataset creation
could not be coordinated. The store is what makes it safe to turn back on — but doing so changes
which tests run on which drivers, so it is a CI-capacity decision to take once the store has been
exercised against a live warehouse, not part of this change.

**One honest residual.** Per-run namespacing is doing two jobs, and only one is a bandaid:

- *Coordination* — "another job might be building this concurrently." Dies with the claim.
- *Write isolation* — tests that mutate their data need a private copy. Legitimate, survives, and is
  now expressed by [[metabase.test.data.interface/temp-database-definition]] rather than by each
  caller stapling a random string onto a database name.

---

## 6. Adoption — insulate first, do not migrate

The incumbent does not need to move for new code to benefit.

1. Define the protocol. Nothing implements it yet.
2. Write an in-memory `DatasetStore` implementing the **full** contract, `:in-progress` included.
   It is the test double for everything built on top — waiters, reapers, decorators — and it is a
   real implementation, not a delegate to the incumbent.
3. New code takes a `DatasetStore` as an argument. Nothing new reaches for `tx/*`.
4. Write a real adapter for **one** driver where the pain is worst and the claim is cheap —
   BigQuery, which already has the tracking table the claim would live in.
5. Reaping moves on top of the protocol as plain composition. The Snowflake reaper becomes
   re-enableable because `:in-progress` makes its failure mode unrepresentable.

Per `~/.claude/GOOS.md` §6 this is L3 (a stated goal) for the new port, L0 for everything else: no
new code reaches for `tx/*` ambiently, and no existing driver is renovated as a precondition.

Proximal composition root: whatever already knows the driver — `get-or-create-database!` for the
load path, `before-run`/`after-run` for the reaper path. `def` the store there and pass it down.
