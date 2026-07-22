# Remote Sync Worktrees — Design

Multi-branch support for remote sync. Multiple git branches of synced content coexist in one
instance as **worktrees** — branch checkouts materialized as ordinary collection trees — so
different people can work on different branches at the same time, without any per-user or
per-session "active branch" state.

The design deliberately mirrors git worktrees: one repository, N working trees, each with its
own base commit and dirty state, no ambient switching. The current synced collection becomes
the **default worktree** — the same mechanism, one derived flag — so main is a special row,
not a special code path.

## Status (as built)

The stack is implemented and open as draft PRs: [#78386](https://github.com/metabase/metabase/pull/78386) schema+model,
[#78387](https://github.com/metabase/metabase/pull/78387) worktree-id threading, [#78388](https://github.com/metabase/metabase/pull/78388)
identity transform, [#78391](https://github.com/metabase/metabase/pull/78391) CRUD API + containment,
[#78405](https://github.com/metabase/metabase/pull/78405) scoped pull/push, [#78406](https://github.com/metabase/metabase/pull/78406) guards,
[#78407](https://github.com/metabase/metabase/pull/78407) FE plumbing, [#78395](https://github.com/metabase/metabase/pull/78395) navbar UI.
Deltas from the design below, decided during implementation and review:

- **Identity scheme**: worktree-local entity ids are `<worktree-id>/<entity-id>` (`/` is not in the NanoID
  alphabet), so the canonical id is parseable from the local id. No derivation, no persisted mapping: the
  `canonical_entity_id` column was dropped, pushes just strip the prefix, and `entity_id` was widened to
  varchar(254) on every table a checkout can materialize. Branch-born entities keep bare NanoIDs.
- **Sync base**: the default worktree's base version stays derived from task history (worktree-scoped
  `last-version`) so it shares its lifecycle with the rest of sync bookkeeping; the `base_version` column
  is authoritative only for non-default worktrees.
- **Default-flow scoping**: everything the default flows touch (import reconcile, export roots, ledger
  rebuild/marking, dirty checks, current-task) is scoped by a shared `worktree-filter-clause`; content
  created inside a checkout is ledgered by its collection's worktree. Adopting a checked-out branch as the
  default is guarded (`check-branch-not-checked-out!`).
- **Deferred**: search exclusion of worktree content (needs a `worktree_id` dimension in the per-model
  search index specs); incremental/3-way pulls and merge pushes for non-default worktrees (full reconcile
  only in v1); decoupling `BranchDropdown`'s create flow from default-branch switching; PR 9 cleanup
  (retire `is_remote_synced` reads, drop the dual-write) lands after the stack merges.
- **Verified end-to-end** against a local `file://` repo through the HTTP API: seed push, checkout+pull
  under prefixed ids, default-pull/checkout coexistence, per-ledger dirty state, worktree push producing
  canonical-id YAML on its branch, dirty-guarded + forced delete, and the switch-collision guard.

## 1. Motivation and constraints

Remote sync today assumes exactly one active branch instance-wide:

- The branch is a single global setting (`remote-sync-branch`,
  `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj`).
- "Switch branch" is a destructive re-import into the shared local state: content is matched
  by `entity_id` and updated in place, and anything absent from the new branch is deleted
  (`remove-unsynced!`, `remote_sync/impl.clj`).
- The sync base is global: `last-version` (`models/remote_sync_task.clj`) scans task history
  with no branch dimension.
- The dirty ledger (`remote_sync_object`) and the one-running-task guard + cluster lock are
  instance-wide.

Requirements:

1. **Coexistence** — N branches' content in one app DB simultaneously.
2. **Concurrent use** — users on different branches don't contend or affect each other.
3. **Reference stability** — content outside synced collections references synced content by
   numeric ID (`dashboard_card.card_id`, `card__N` source tables, click behavior,
   subscriptions, sandboxes, documents, …). Those references must keep working.

On (3): references always resolve to the **default worktree's** rows. Main rows are updated
in place on every pull (entity_id matching preserves numeric IDs), so external references
never break and see merged results after a branch merges. References are *durable*, not
*branch-sensitive*: there is no per-user ID remapping. Previewing external content against an
unmerged branch is out of scope (workaround: copy the external content into the worktree).

Designs considered and rejected, for the record:

- **Per-user ambient branch + branch column** (`branch-column-poc`): every content read path
  needs a branch filter; external numeric refs still need entity_id-based remapping; checkout
  requires full materialization; leaks are silent-corruption-shaped.
- **Copy-on-write + remapping table + QP overlay** (`git-branching-poc`): read-path resolution
  must be hooked into every endpoint/hydration/QP path; write-side inverse remapping needed;
  per-user ambient state remains.
- **Schema-per-branch app DB**: schema resolution is table-granular but branching is
  row-granular (`report_card` mixes synced and unsynced rows); the FK web from non-copied
  tables breaks; sync scope includes `metabase_field` (FieldUserSettings) which cannot be
  forked; MySQL has no `search_path`; migrations must run against N schemas.
- **Composite `(branch_id, id)` identity**: `id` stops uniquely identifying a row, so every
  `t2/select-one ... :id` becomes branch-aware or nondeterministic; FK anchoring breaks;
  PK/auto-increment surgery on the largest tables.

The worktree model wins because it has **no ambient state and no resolution layer at all**:
branch content is ordinary content. All novelty concentrates in one serdes identity
transform (§5).

## 2. Concept mapping

| git                                | Metabase                                                              |
| ---------------------------------- | --------------------------------------------------------------------- |
| repository                         | configured remote (`remote-sync-url` / `remote-sync-token`, global)    |
| main worktree                      | default worktree = today's synced collections; irremovable            |
| linked worktree                    | `remote_sync_worktree` row + its collection trees                      |
| `.git/worktrees/*` metadata        | the `remote_sync_worktree` table                                       |
| per-worktree HEAD                  | `branch` + `base_version` (last synced SHA)                            |
| the index / `git status`           | per-worktree `remote_sync_object` rows / `GET dirty`                   |
| `git worktree add`                 | `POST /api/ee/remote-sync/worktrees` then first pull                   |
| commit + push                      | export scoped to the worktree                                          |
| fetch + merge                      | import scoped to the worktree (incremental / 3-way paths)              |
| "branch is already checked out"    | `UNIQUE(branch)`                                                       |
| `git worktree remove`              | `DELETE /worktrees/:id` (dirty guard, `force`)                         |
| `git worktree prune`               | GC listing when the remote branch disappears; user confirms            |

Git's one-branch-one-worktree rule is load-bearing: it makes concurrent-push ambiguity
unrepresentable. Sparse checkouts (`root_path`) are deferred to keep that invariant simple.

## 3. Schema

One new table:

```sql
remote_sync_worktree (
  id            int  PK,
  branch        varchar NOT NULL UNIQUE,
  base_version  varchar,               -- last synced git SHA; NULL = created, never pulled
  creator_id    int  FK -> core_user,
  created_at    timestamp
)
```

Columns on existing tables:

- `collection.remote_sync_worktree_id` — nullable FK. This **upgrades the existing
  `is_remote_synced` boolean to an FK**: the boolean already means "belongs to *the*
  checkout"; the FK generalizes it to "belongs to *this* checkout". Stamped on every
  collection in a worktree tree (not just roots), exactly as the boolean cascade in
  `bulk-set-remote-sync` does today, so scoping queries stay `WHERE worktree_id = ?`.
- `remote_sync_object.worktree_id` — per-worktree dirty ledger.
- `remote_sync_object.canonical_entity_id` — the entity-id mapping (§5). NULL on
  default-worktree rows (local = canonical).
- `remote_sync_task.worktree_id` — per-worktree task history and locking.

Deliberate non-columns:

- **No `is_default`** — derived: the default worktree is the one whose `branch` equals the
  `remote-sync-branch` setting. `UNIQUE(branch)` guarantees at most one. This keeps full
  back-compat: the setting keeps its meaning, `MB_REMOTE_SYNC_BRANCH` env pinning keeps
  working, and switching the default still flows through the guarded reconcile
  (`check-branch-matches-setting!` 409 flow). It also avoids "exactly one true" enforcement,
  which needs partial unique indexes MySQL doesn't have.
- **No `collection_id` on the worktree** — a branch can have multiple root collections
  (the repo supports multiple managed top-level paths). Roots are derived: collections with
  this `worktree_id` whose parent isn't in the worktree.
- **No `root_path`** (sparse checkout), **no `locked`** (no auto-prune in v1), **no
  `sync_type`** (inherit the global setting) — all deferrable without schema debt.

`base_version` stays a real column rather than being derived from task history: the
`last-version` scan is exactly the fragile global state this design removes, and a direct
pointer keeps task rows prunable.

Worktree identity of an entity = its collection's `worktree_id`. Default worktree resolution:
`(t2/select-one :model/RemoteSyncWorktree :branch (settings/remote-sync-branch))`, created
lazily (the branch setting can come from an env var, so a SQL migration cannot seed it —
see PR 1).

## 4. Lifecycle and semantics

**Create** — cheap metadata insert; no content. Validates remote sync is configured and the
branch exists on the remote (via the existing branch listing), or forks it server-side first
(`from_branch`, reusing `create-branch!` git plumbing minus its setting flip). 409 on
`UNIQUE(branch)` conflict, carrying the existing worktree id.

**First pull** (`base_version IS NULL`) — snapshot the branch (existing `GitSource`), serdes
load with the identity transform (§5), collections created with `worktree_id` stamped, RSO
rows seeded as `synced` with `canonical_entity_id`. Subsequent pulls run the existing
incremental / full / 3-way merge paths (`impl.clj`) scoped to the worktree, diffing against
its `base_version`; `remove-unsynced!` constrained to the worktree's trees.

**Push** — export roots scoped to the worktree, reverse identity transform (local →
canonical eids; new-on-branch entities register canonical = local), collection paths
re-rooted to the repo layout, commit to the branch, advance `base_version`.

**Merge** — happens in git (PR). The default worktree pulls the merged branch; main rows are
updated in place by canonical entity_id, numeric IDs stay stable, external references see
merged content. The branch worktree is then deletable.

**Delete** — dirty guard (400 with `dirty_objects` unless `force`); refused for the default
worktree ("change `remote-sync-branch` first"); removes the collection trees, RSO rows, and
the worktree row.

**Dirty tracking** — `events.clj` resolves the changed entity's collection `worktree_id`
directly (replacing the global synced-collection-set membership test) and stamps it on the
RSO upsert. `spec.clj` scoping (`should-sync-collection?`, `all-syncable-collection-ids`)
becomes per-worktree.

**Concurrency** — the one-running-task invariant (`models/remote_sync_task.clj`
before-insert), `ensure-no-active-task!` (`guards.clj`) and the cluster lock key on
`worktree_id`. Operations on different worktrees run concurrently; operations on the same
worktree serialize. `branch-changed-since-scheduling?` only applies to default-worktree
tasks (it guards the ambient setting, which non-default worktrees don't have).

**Exclusions** — path-identity synced state (Table/Field via FieldUserSettings, transforms,
python libraries) is default-worktree-only: those attach to shared physical objects that
cannot exist per-branch. Non-default pulls skip those specs; the UI shows them read-only.
(If branch-edited transforms become a requirement, the workspaces module's warehouse
`table_remapping` is the composable answer — a workspace can own a worktree — but nothing
here depends on it.)

## 5. Entity-id identity transform

The one genuinely novel mechanism. Serdes matches by entity_id and upserts in place, so
importing branch B alongside main would overwrite main's rows. Non-default pulls therefore
transform identities:

- Every imported entity gets a **local entity_id** derived deterministically from
  `(canonical_entity_id, worktree)` (hash → NanoID alphabet, 21 chars), so re-checkout is
  stable. The `canonical → local` pair is recorded on the entity's RSO row
  (`canonical_entity_id`); lifecycles align exactly (import rebuilds RSO rows at the moment
  it assigns local eids; worktree deletion cleans both).
- References in the branch YAML to entities **not in the checkout** (unsynced content,
  excluded specs) resolve by canonical eid against main rows — stock serdes behavior.
- **New-on-branch** entities keep their generated eid as canonical (`local = canonical`), so
  the eid survives merge to main.
- Export reverses the mapping via RSO. **Invariant: checkout → no local edits → push is
  byte-identical to what was imported.** This round-trip is the core correctness property
  and gets dedicated tests before any UI exists (see PR 3).

Side effect, intended: branch copies of the Library collections do not carry the fixed
library entity_ids (`librarylibrarylibrary` …), so `library-root-collection?` and everything
keyed on it treat them as plain collections inside the worktree — no special-section
hijacking. The `:library-conflict` import handling (`impl.clj`) must be scoped to
default-worktree pulls only.

## 6. API

New resource:

```
GET    /api/ee/remote-sync/worktrees
POST   /api/ee/remote-sync/worktrees        {branch, from_branch?}
GET    /api/ee/remote-sync/worktrees/:id
DELETE /api/ee/remote-sync/worktrees/:id    {force?}
```

Response shape:

```json
{
  "id": 3,
  "branch": "feat/quarterly",
  "base_version": null,
  "is_default": false,
  "roots": [{"id": 812, "name": "Finance"}],
  "creator_id": 5,
  "created_at": "..."
}
```

No PUT: `branch` is identity (rename = delete + create, matching git), `base_version` is
machine-managed, `creator_id` immutable.

Existing operation endpoints gain an optional `worktree_id` (`api.clj`):

- `POST /import` — `worktree_id` present → pull that worktree; `branch`/`expected_branch`
  are rejected alongside it (they guard the ambient default-switch flow, which keeps its
  legacy behavior verbatim when `worktree_id` is absent).
- `POST /export`, `GET /dirty`, `/is-dirty`, `/has-remote-changes`, `/export-preflight` —
  same optional param; absent = default worktree.
- `GET /current-task` → `?worktree_id=`; task responses grow `worktree_id`.

Collection endpoints (`collections_rest/api.clj`) gain `include-worktrees?` (default
**false**), mirroring the existing `include-library?` pattern: non-default-worktree
collections are excluded from list/tree/items unless opted in. This is the primary
containment mechanism — pickers, search UIs, the SDK, and third-party API consumers never
see branch content unless they ask. FE filtering is presentation, not safety.

Collection API responses expose `remote_sync_worktree_id` (hydrated), the upgrade path for
today's `is_remote_synced` field.

## 7. Guards

Mirroring the Library's backend-enforced / FE-mirrored split (`check-library-update`,
`check-allowed-content` in `collections/models/collection.clj`):

- `check-worktree-update` in collection `pre-update`: no moving collections across a worktree
  boundary in either direction (it would silently mean delete-from-one-ledger /
  create-in-another; explicit copy flows can come later); no nesting a worktree root under
  another worktree; worktree-root deletion only via the worktree DELETE.
- `assert-valid-remote-synced-parent` generalizes from the boolean to "same worktree_id as
  parent".
- Content-eligibility rules (`batch-model-eligible?`, `collection-editable?` in
  `remote_sync/core.clj`) already key off synced-collection membership and generalize with
  the FK.

## 8. Search

Worktree content is excluded from default search: a `worktree_id` dimension in the search
index spec (`search/spec.clj` / `filter.clj`), filter `worktree_id IS NULL OR = default`,
with an opt-in context for worktree-scoped search later. Without this, every branch
multiplies search hits for the same logical content. The `root-collection-type-by-id`
machinery used by the library scorer is the precedent for resolving a hit's worktree
cheaply.

Permissions admin: worktree trees inherit the main root's permission graph at creation
(copied, then independently curatable); the permissions UI hides or groups non-default
worktree trees.

## 9. Frontend

All behind `PLUGIN_REMOTE_SYNC` (OSS renders nothing), mirroring `PLUGIN_LIBRARY`'s
structure (`frontend/src/metabase/plugins/oss/`, EE `initializePlugin` gated on the token
feature):

- **Navbar**: a "Worktrees" `CollapseSection` (persisted expand state via `useUserSetting`,
  like `expand-library-in-nav`) with a **+** button in the header. One synthetic folder node
  per non-default worktree — `id: "worktree-<id>"`, `nonNavigable: true`, branch name, branch
  icon — children = the worktree's root collection trees via `buildCollectionTree`. This is
  exactly the synthetic-container pattern `NavbarLibrarySection.tsx` already uses
  (`buildSectionTree`'s permission-degraded fallback). The synthetic folder also solves the
  name-collision problem ("Finance" main vs branch) at the presentation layer, keeping the
  schema flat.
- **Create flow**: + → branch picker (existing `GET /branches` + "new branch from…") →
  `POST /worktrees` → auto-fire first pull → folder renders in a "pulling…" state off the
  task endpoint; `base_version: null` is the honest "created, not yet pulled" state with a
  retry affordance on failure.
- **Folder menu**: Pull / Push / Delete, mapping 1:1 to the API; the DELETE dirty-guard 400
  surfaces as the confirmation dialog. Dirty badges reuse
  `PLUGIN_REMOTE_SYNC.CollectionSyncStatusBadge`; `useRemoteSyncDirtyState` gains
  `worktree_id` scoping so badges don't all light up from one branch's edits.
- **Filtering**: `regularCollections` in `MainNavbarView.tsx` and the Library section's
  `collections.find(isLibraryCollection)` both subtract worktree members via a shared
  `isWorktreeCollection` predicate — the Library lookup otherwise matches a branch's Library
  copy (`find` takes the first hit). Pickers and action guards get the same predicate where
  the Library has one (`use-get-root-items`, `MoveModal`, `canArchiveItem`,
  `isEditableCollection`), though `include-worktrees=false` already keeps branch content out
  of most of them.
- **Types**: `remote_sync_worktree_id` on `Collection` in `metabase-types/api`; worktree RTK
  endpoints in `metabase-enterprise/api` with named arg/response types.

## 10. PR stack

Ordered so that everything before PR 6 is **behavior-preserving** (N=1: only the default
worktree exists, nothing user-visible changes), each PR is independently reviewable and
green, and the risky serdes work lands early with tests but dark.

1. **Schema + model (no behavior change).** Migration for `remote_sync_worktree`,
   `collection.remote_sync_worktree_id`, `remote_sync_object.{worktree_id,
   canonical_entity_id}`, `remote_sync_task.worktree_id`. `:model/RemoteSyncWorktree` with
   schema.clj + Malli. `ensure-default-worktree!`: lazily creates the default row from the
   `remote-sync-branch` setting and backfills `collection.worktree_id` from
   `is_remote_synced` (lazy because the setting may be env-var-sourced, so a SQL migration
   can't seed it). Dual-write `is_remote_synced` ↔ `worktree_id` at the model layer.
   Nothing reads the new columns yet. `./bin/mage fix-modules-config` for the new model.

2. **Thread worktree identifiers through the backend (no behavior change).** `impl.clj`,
   `spec.clj`, `events.clj`, `guards.clj`, `models/remote_sync_*` functions take an explicit
   worktree argument; all call sites resolve the default worktree. `last-version` replaced
   by `base_version` reads/writes (task `version` still written for observability). Cluster
   lock and task-uniqueness keyed by worktree id. RSO rows stamped. Synced-collection
   scoping reads flip from the boolean to `worktree_id`. Pure plumbing; the diff is wide but
   mechanical, and the existing remote-sync test suite is the regression net.

3. **Identity transform, dormant.** Canonical↔local eid derivation + RSO recording +
   serdes load/extract hooks, exercised only by new tests: the byte-identical round-trip
   property, re-checkout stability, refs-to-outside-checkout resolution, new-on-branch eid
   preservation. Default-worktree paths continue using identity mapping (`canonical_entity_id
   IS NULL`). No API surface.

4. **Worktree CRUD API.** `GET/POST/DELETE /worktrees` + validations + `from_branch`;
   `include-worktrees?` param on collection endpoints (a no-op filter while no non-default
   worktrees exist); `remote_sync_worktree_id` in collection responses. Endpoint gated on a
   feature flag (e.g. `remote-sync-worktrees` setting) so creation isn't reachable in
   production until the stack completes.

5. **Scoped pull/push.** `worktree_id` on import/export/dirty/preflight/current-task;
   non-default first-pull materialization path wired to the PR 3 transform; per-worktree
   locks now genuinely concurrent; `remove-unsynced!` and the merge paths scoped;
   `:library-conflict` scoped to default. Backend feature-complete behind the flag.

6. **Guards + search.** `check-worktree-update`, parent-consistency generalization,
   worktree dimension + default filter in the search spec, permissions-graph copy on first
   pull.

7. **FE: plumbing.** Types, RTK endpoints, `isWorktreeCollection` predicate behind
   `PLUGIN_REMOTE_SYNC`, navbar/library-section filtering (inert until worktrees exist).

8. **FE: Worktrees section.** `NavbarWorktreesSection` (synthetic folders, create flow,
   pulling/retry states, folder menu, per-worktree dirty badges), picker/guard touch-ups.
   Flag flips on when this merges.

9. **Cleanup.** Retire `is_remote_synced` reads (keep the API field as a derived alias),
   drop the dual-write, prune-listing UX, docs.

Rough sizing: PRs 1, 3, 4, 6, 7 are small-to-medium; 2 is wide-but-mechanical; 5 and 8 are
the two substantial ones. Nothing user-visible changes before the flag flips at PR 8, and
every PR from 2 onward is testable against the invariant "existing single-branch behavior is
byte-for-byte unchanged."
