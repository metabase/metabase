# Remote Sync Worktrees — Design (v4, as built)

Multi-branch support for remote sync. Multiple git branches of synced content coexist in one
instance as **worktrees** — branch checkouts materialized as ordinary collection trees — so
different people can work on different branches at the same time, without any per-user or
per-session "active branch" state.

The design mirrors git worktrees: one repository, N working trees, each with its own base
commit and dirty state, no ambient switching. Unlike earlier drafts, **the main app is not a
worktree**: main-app content (including default-branch remote sync) simply carries a NULL
worktree reference, and the `remote_sync_worktree` table holds only real checkouts, one row
per branch. There is no default row, nothing is seeded or repointed, and switching the sync
branch stays a plain setting write.

## Status (as built)

Implemented as an 8-PR draft stack:
[#78386](https://github.com/metabase/metabase/pull/78386) schema + model,
[#78387](https://github.com/metabase/metabase/pull/78387) sync-base scoping,
[#78388](https://github.com/metabase/metabase/pull/78388) serdes scoping seam,
[#78391](https://github.com/metabase/metabase/pull/78391) CRUD API + containment,
[#78405](https://github.com/metabase/metabase/pull/78405) scoped pull/push,
[#78406](https://github.com/metabase/metabase/pull/78406) guards + permissions copy,
[#78407](https://github.com/metabase/metabase/pull/78407) FE plumbing,
[#78395](https://github.com/metabase/metabase/pull/78395) navbar UI + shared pull/push menu.

Verified end-to-end against a local `file://` repo through the HTTP API: seed push,
checkout + pull producing same-entity-id copies, main/checkout coexistence and tree
containment, per-ledger dirty state, worktree push writing only its branch, dirty-guarded +
forced delete, and the switch-collision guard.

## 1. Motivation and constraints

Remote sync previously assumed exactly one active branch instance-wide: the branch is a
global setting, "switch branch" is a destructive re-import into shared local state, the sync
base is a global task-history scan, and the dirty ledger and task guards are instance-wide.

Requirements:

1. **Coexistence** — N branches' content in one app DB simultaneously.
2. **Concurrent use** — users on different branches don't contend or affect each other.
3. **Reference stability** — content outside synced collections references synced content by
   numeric ID; those references must keep working while branches come and go.
4. **No ambient state** — no per-session active branch; a checkout is a place, not a mode.

## 2. Concept mapping

| git                             | Metabase                                                            |
| ------------------------------- | ------------------------------------------------------------------- |
| repository                      | configured remote (`remote-sync-url` / `remote-sync-token`, global)  |
| main worktree                   | the main app (NULL worktree reference); not a `remote_sync_worktree` row |
| linked worktree                 | `remote_sync_worktree` row + its collection trees                    |
| per-worktree HEAD               | `branch` + `base_version` (last synced SHA)                          |
| the index / `git status`        | per-worktree `remote_sync_object` rows / `GET dirty?worktree-id`     |
| `git worktree add`              | `POST /api/ee/remote-sync/worktrees` then first pull                 |
| commit + push                   | export scoped to the worktree                                        |
| fetch + reset                   | pull scoped to the worktree (full reconcile in v1)                   |
| "branch is already checked out" | `UNIQUE(branch)` + refusal to check out the current sync branch      |
| `git worktree remove`           | `DELETE /worktrees/:id` (dirty guard, `force`)                       |

Git's one-branch-one-worktree rule is load-bearing: it makes concurrent-push ambiguity
unrepresentable. The main sync branch cannot be checked out as a worktree, and a checked-out
branch cannot become the main sync branch until its worktree is deleted.

## 3. Schema

One new table:

```sql
remote_sync_worktree (
  id            int  PK,
  branch        varchar(254) NOT NULL UNIQUE,
  base_version  varchar(254),          -- last synced git SHA; NULL = created, never pulled
  creator_id    int  FK -> core_user ON DELETE SET NULL,
  created_at    timestamp
)
```

`remote_sync_worktree_id` (nullable, FK → `remote_sync_worktree` **ON DELETE CASCADE**) on
every serdes content table: `collection`, `report_card`, `report_dashboard`,
`report_dashboardcard`, `dashboard_tab`, `document`, `native_query_snippet`, `timeline`,
`segment`, `measure`, `action`, `glossary`, `parameter_card`. Semantics: **NULL = the main
app** (including default-branch synced content), non-NULL = a checkout's copy. Plus
`remote_sync_object.worktree_id` (CASCADE — the ledger dies with the checkout) and
`remote_sync_task.worktree_id` (SET NULL — task history outlives it).

**Entity-id uniqueness is per worktree.** The single-column `entity_id` uniques are dropped
(dbms-split SQL changesets; Liquibase's inline uniques are auto-named per dialect) and
replaced with declared `UNIQUE (entity_id, remote_sync_worktree_id)`. Entity ids themselves
stay canonical 21-char NanoIDs everywhere — a checkout's copy of a card has the *same*
`entity_id` as the main app's. SQL NULL-distinctness means two NULL-worktree rows with the
same entity id are not DB-unique; acceptable, since NanoIDs are app-generated, and
`seed-entity-ids!` refuses duplicates in code.

No data migration is needed: existing content is main-app content and NULL is the column
default.

Deliberate non-columns: no `is_default` (there is no default worktree at all); no
`collection_id` on the worktree (a branch can have several root collections; roots are
derived — members whose parent isn't a member); no sparse-checkout/locked/sync-type columns.

## 4. Serdes scoping seam

The mechanism that lets copies coexist under one entity id (replaces the earlier
`<worktree-id>/<entity-id>` prefix scheme entirely):

- `serdes/*worktree-id*` — a dynamic var in `metabase.models.serialization`. Entity-id
  matching in `lookup-by-id` (and everything that funnels through it: `load-find-local`,
  fk resolution, the nested import matcher) adds `remote_sync_worktree_id = <bound-or-NULL>`
  for the models in `serdes/worktree-scoped-models`. The nil scope — match only NULL rows —
  is exactly the pre-worktrees main-app behavior.
- The default `load-insert!` stamps new rows with the bound worktree; the collection stamp
  hook prefers the bound worktree, then parent inheritance, then NULL.
- The remote-sync ledger rebuild (`sync-all-entities!`) resolves imported entity ids under
  the same scope, so a checkout's ledger never picks up the main app's rows.

A worktree pull is then just a plain serdes load with the var bound: matching sees only that
worktree's rows, the reconcile deletes unimported content by the worktree column, and a
worktree push is a plain export of the worktree's ledger — git only ever sees canonical
content, no transform.

## 5. Lifecycle

- **Create** — metadata insert (`POST /worktrees`, optional `from_branch` server-side fork).
  Refused for the current sync branch and for already-checked-out branches (409).
- **Pull** — full reconcile: scoped load, delete-unimported by worktree column, rebuild the
  worktree's RSO ledger, record `base_version`. Pulls ingest only `collections/` and
  `snippets/`; path-identity content (databases, transforms, python libraries) stays
  main-app-only. After a pull, collections with no grants copy the permissions of their
  main-app counterpart (same entity id, NULL worktree) — a checkout is exactly as visible as
  what it mirrors, never more.
- **Edit** — ordinary collection content. Events ledger changes into the collection's
  worktree (`ledger-worktree-id`), so main dirty state and worktree dirty state never mix.
- **Push** — full export of the worktree ledger to its branch; refuses (unless forced) when
  the remote advanced past `base_version`.
- **Delete** — root collections deleted through the model (content hooks run), then the row;
  the ledger goes via FK cascade. Dirty guard with `force` override.
- **Branch switch (main app)** — unchanged setting write, guarded by
  `check-branch-not-checked-out!` (a worktree row for the branch means it is checked out).

Scoping rule everywhere: worktree flows pass the id, main-app flows pass nothing, and the
queries are strict — `worktree_id = ?` vs `worktree_id IS NULL` (`worktree-filter-clause`).
The one deliberate exception: a running main-app sync also blocks worktree operations (same
remote repository).

## 6. API

Worktree CRUD: `GET/POST /api/ee/remote-sync/worktrees`, `GET/DELETE /worktrees/:id`
(`force` query param). Existing sync endpoints take the scope: `import`, `export`,
`is-dirty`, `dirty`, `has-remote-changes`, `current-task` (+ `cancel`) accept
`worktree_id`/`worktree-id`; omitting it addresses the main app, and its ambient-branch
guards (`expected_branch` CAS) cannot be bypassed via the worktree path. All gated on the
`remote-sync-worktrees` boolean setting.

Collection listings (`tree`, list, root items) exclude worktree content via the OSS
`non-worktree-filter-clause` (`remote_sync_worktree_id IS NULL`) unless `include-worktrees`
is passed; browsing into a worktree collection shows its children. The exclusion is plain OSS
data filtering with no feature gate: if an instance loses the EE feature, worktree content is
simply hidden from the main tree, never exposed into it.

## 7. Guards

- One branch, one materialization: worktree-per-branch unique; the sync branch can't be
  checked out; a checked-out branch can't become the sync branch.
- **Worktree membership is immutable.** `remote_sync_worktree_id` is derived at insert from the
  row's container (item → collection, dashcard/tab → dashboard, action → model card, collection →
  parent collection; a worktree pull binds the loaded worktree), never client-supplied, and any
  move that would change it — between two worktrees, or into/out of one — is refused with a 400.
  Worktree content changes only through pulls. Trash moves are exempt (archived rows keep their
  membership so a worktree delete still sweeps them). Enforced in OSS model hooks, so the data
  stays correct regardless of edition or feature flags.
- Per-worktree cluster locks; the ledger and task history are scope-strict.

## 8. Frontend

- A **Worktrees** navbar section (before Data), one node per checkout showing its branch and
  root collections; a plus button opens the checkout modal (BranchDropdown reuse) which
  creates the worktree and pulls it. Collapsed state persists per user
  (`expand-worktrees-in-nav`).
- `GitSyncOptionsDropdown` is the one pull/push menu for both the app-bar git controls and
  the per-worktree menu — same wording, icons, disabled states, tooltips; a `worktreeId`
  prop adds "Delete worktree". Worktree pulls/pushes hit the same import/export endpoints
  (with `worktree_id`) and surface the same sync progress modal (the listener middleware
  tracks `pullWorktree`/`pushWorktree`; current-task polling carries the scope).
- Admin: the `remote-sync-worktrees` toggle lives in the remote-sync settings form.

## 9. Deferred

- Search exclusion of worktree content (needs a worktree dimension in the search index
  specs).
- Incremental / 3-way pulls and merge pushes for worktrees (full reconcile only in v1).
- Entity-id translation ambiguity: eid-based API lookups should prefer the main-app scope
  when copies exist.
- Decoupling `BranchDropdown`'s create flow from default-branch switching.
- Cleanup PR: retire `is_remote_synced` reads in favor of the worktree column where
  possible.
