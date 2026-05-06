# Remote Sync — How It Works

A guide to the Metabase Remote Sync feature, focused on **git branches** and **branch switching**. Citations are full paths with line numbers.

---

## 1. User Mental Model

Before diving into how the system is built, it's worth being explicit about what the user *thinks* they're doing — because the implementation diverges from that picture in ways that matter for understanding the bugs.

### What the user thinks they're doing

The UI presents Remote Sync as **git-for-content**. A user with a git background sees:

- **A "current branch" indicator** in the app bar — read as "the branch I am working on right now."
- **A pull button** — "fetch new content from the team."
- **A push button** — "send my edits to the team."
- **A switch-branch dropdown** — "move my workspace to a different branch."
- **Create-branch from the dropdown** — "branch off from where I am to start something new."
- **A "you have unsaved changes" indicator** — "I have edits that aren't pushed yet."
- **Stash** — "set aside my edits temporarily so I can switch branches."

This is a clean mental model: I edit, I push, I pull, I branch, I switch. Just like git.

### What actually happens

The implementation is structurally quite different:

- **There is no working tree.** "What I'm working on" isn't a checkout of files — it's the **live database content** of collections marked `is_remote_synced=true`. Edits happen in the running app, not in a workspace I can diff.
- **Switching branches is `serialize → import`**, not checkout. The backend fetches the new branch's tip, deserializes its YAML files, and rewrites the live Metabase content. Anything not in the import gets removed.
- **"Dirty state" is a side-table.** Every edit to a synced entity inserts/updates a `RemoteSyncObject` row with status `create`/`update`/`delete`. "You have unsaved changes" is just `SELECT exists FROM remote_sync_object WHERE status != 'synced'`.
- **Push is one big commit.** The export serializes everything in synced collections into YAML, makes one commit authored by `Metabase Library <library@metabase.com>`, and pushes. There are no per-entity commits, no review-before-push, no rebase, no merge.
- **The "current branch" is shared across the whole instance.** It's the global setting `remote-sync-branch`. Every admin reads the same value. There is no per-user branch.
- **The branch shown reflects what the system actually loaded last, not what the user picked.** It only updates when an import completes successfully.

### Where the mental model breaks

These are the friction points — places where what the user expects diverges from what the system can do:

1. **"My branch" isn't mine.** Two admins cannot be on different branches. Either they coordinate manually ("hey, I'm switching to `feature-x` for an hour, don't push") or one of them gets surprised when the indicator changes. There is no concept of a per-user session here.

2. **Switching is destructive of uncommitted work.** In real git, switching with uncommitted changes either errors, stashes, or carries changes forward. Here the equivalent action would *overwrite* the live database with the new branch's content. So the UI has to interrupt: "you have unsaved changes — push, stash, or discard?" The `SyncConflictModal` exists for this. A regular git user wouldn't expect this prompt to appear when "switching."

3. **Async creates a "what state am I in?" gap.** The user clicks "switch to main." The dropdown stays on the previous branch for several seconds while the import runs, then flips. Or it doesn't flip, and the user has no clear signal about whether the switch succeeded. In git, `checkout` is local and instant. Here it's a network-bound, multi-step, server-side operation.

4. **The branch indicator can lag reality, which is exploitable.** A long-running task captures branch X. The user, observing nothing happening, switches to Y. Sometime later, the task lands and the indicator flips from Y back to X. The user never sees the task; they just see "the system unswitched me." The mental model has no slot for "an old task can override your action." This is the GHY-3505 bug.

5. **Stash isn't really stash.** Real git stash is invisible — your branch state is unchanged. Here, "stash" creates a new branch *and switches to it*. After stashing, you're not on your original branch; you're on the stash branch. Many users have to mentally re-translate the operation as "branch off + push + you're now on the new branch."

6. **Pull means different things in different modes.** Read-only mode auto-imports every N minutes; the user doesn't pull manually, and the indicator can change without their input. Read-write mode requires manual pull. The same UI affordance has different meanings depending on a setting they may not see.

### User actions vs engine operations

The user never sees the words "import" or "export" in the UI. Those are the engine functions (`import!`, `export!` in `impl.clj`) and the names of the API endpoints (`POST /import`, `POST /export`). Every user-facing action maps to one of them under the hood:

| User action | UI affordance | Engine op |
|---|---|---|
| Pull | "Pull" in the app-bar dropdown | `import!` against current branch |
| Switch branch | Branch dropdown (clean state) | `import!` against target branch |
| Discard local + switch | "Discard and switch" in conflict modal | `import!` with `force=true` |
| Push | "Push" + commit-message modal | `export!` to current branch |
| Stash | "Stash to new branch" in conflict modal | `create-branch` + `export!` to the new branch |
| Create branch | "Create branch ..." in the picker | `create-branch` only — no content sync |
| Initial setup / mode change | Admin settings PUT | `finish-remote-config!` may trigger `import!` (read-only mode) |
| *(automatic, no user action)* | n/a | Quartz auto-import every N minutes (read-only + `remote-sync-auto-import` only) |

Two consequences worth being explicit about:

1. **There's no user-visible "import" verb.** When code or this doc says "the import for branch X finished," the user perceives it as "my pull / my switch / my discard finished" — or, in the auto-import case, perceives nothing at all because they didn't initiate anything.
2. **Some imports happen without user input.** Auto-import (read-only mode, default every 5 minutes) and the import triggered by `finish-remote-config!` are both server-initiated. This matters for the bug — a user who didn't trigger anything can still see the branch indicator change because of an async task they didn't start.

### Implication

The reporter's frustration ("I was switched automatically") had two distinct causes. The captured-branch race — a stale task's late completion overwriting the user's branch switch — is fixed by the guards described in §10. Even with that fixed, in a multi-admin setup, "the branch changed without me doing anything" can still happen because the branch is a shared global setting and another admin can change it. That's a design property, not a bug.

---

## 2. What is Remote Sync?

Remote Sync ("git sync") lets a Metabase instance back its content (collections, dashboards, cards, transforms, snippets, etc.) with a remote git repository. Two flavors:

- **read-only** — pulls content from a configured branch on a schedule. Local edits to synced content are blocked.
- **read-write** — users can push/pull from the UI, switch branches, create branches, and stash uncommitted local changes onto a new branch.

The repo is interacted with through **JGit** (`org.eclipse.jgit`); the working tree is a bare clone in a temp directory. Metabase reads/writes blobs directly via JGit's plumbing rather than running `git` commands.

There is no checkout in the file-system sense. "The current branch" is a **setting** (`remote-sync-branch`). Switching is a database change followed by an import.

---

## 3. Big Picture: Backend / Frontend Layout

### Backend

- **OSS shims** (always loaded):
  - `src/metabase/remote_sync/core.clj` — `defenterprise` stubs that return "everything is editable" on OSS.
  - `src/metabase/remote_sync/events.clj` — declares event hierarchy keywords so the EE handlers can hook in without OSS depending on EE.
  - `src/metabase/remote_sync/init.clj` — t2 batched-hydrate for the `:is_remote_synced` flag on collections.

- **EE implementation** (`enterprise/backend/src/metabase_enterprise/remote_sync/`):
  - `core.clj` — public defenterprise entry points (editability checks, `bulk-set-remote-sync`).
  - `api.clj` — HTTP endpoints under `/api/ee/remote-sync/*`.
  - `impl.clj` — the import/export engine, async task runner, "has-remote-changes?" cache, conflict checking.
  - `guards.clj` — `task-running?` predicate and `ensure-no-active-task!` helper, called at the top of every mutating operation to refuse while a task is in flight.
  - `settings.clj` — settings (`remote-sync-url`, `remote-sync-branch`, `remote-sync-token`, `remote-sync-type`, …) and `check-and-update-remote-settings!`.
  - `source.clj` + `source/protocol.clj` + `source/git.clj` + `source/ingestable.clj` — the source abstraction. Today only `git` is implemented.
  - `models/remote_sync_task.clj` — the `RemoteSyncTask` model: one row per import/export, tracking progress and version (git SHA).
  - `models/remote_sync_object.clj` — the `RemoteSyncObject` table: per-entity dirty state (`create`/`update`/`delete`/`removed`/`synced`).
  - `events.clj` — event handlers that maintain `RemoteSyncObject` as users edit Metabase content.
  - `task/import.clj` — Quartz job that auto-imports on a timer (read-only mode only).
  - `init.clj` — installs an isolated JGit `SystemReader` so JGit ignores `~/.gitconfig` / `/etc/gitconfig`.
  - `schema.clj` — Malli schemas for API request/response bodies.
  - `spec.clj` — per-model "spec" registry: which models sync, how to detect eligibility, hydration, deletion order.

### Frontend

- **EE plugin** (`enterprise/frontend/src/metabase-enterprise/remote_sync/`):
  - `index.ts` — wires the plugin into `PLUGIN_REMOTE_SYNC` slots and registers the listener middleware + reducer (gated on the `remote_sync` premium feature).
  - `sync-task-slice.ts` — Redux slice tracking the in-flight task and the modal state (`currentTask`, `showModal`, `syncConflictVariant`).
  - `middleware/remote-sync-listener-middleware.ts` — RTK listener middleware that wires API mutation lifecycles into the slice and invalidates cache tags on terminal task states.
  - `hooks/use-git-sync-visible.ts` — gates the branch UI on admin + read-write + branch set.
  - `components/GitSyncControls/` — the app-bar branch dropdown, the "switch branch" picker, and the pull/push action menu.
  - `components/SyncConflictModal/` — modal shown when a switch/pull/push collides with dirty state; includes `mutation-wrappers.ts` for the force-import / stash / push paths.
  - `components/GitSettingsModal/`, `components/RemoteSyncAdminSettings/` — admin configuration UI.

- **API layer** (`enterprise/frontend/src/metabase-enterprise/api/remote-sync.ts`):
  - RTK Query endpoints for `/api/ee/remote-sync/{import,export,branches,create-branch,settings,is-dirty,dirty,has-remote-changes,current-task,current-task/cancel}`.

---

## 4. The Core Data Types

### `remote-sync-branch` setting

The "current branch" is a setting:

- Defined at `enterprise/backend/src/metabase_enterprise/remote_sync/settings.clj:23-29` (`defsetting remote-sync-branch`).
- Visibility `:admin`, `:can-read-from-env? false`, no encryption.
- Read with `(settings/remote-sync-branch)`, written with `(settings/remote-sync-branch! …)`.

Other key settings in the same file:
- `remote-sync-url` (settings.clj:42-48), `remote-sync-token` (settings.clj:31-40), `remote-sync-type` (settings.clj:50-65, `:read-only`/`:read-write`), `remote-sync-auto-import` (settings.clj:67-73), `remote-sync-auto-import-rate` (settings.clj:75-81), `remote-sync-task-time-limit-ms` (settings.clj:83-89), `remote-sync-transforms` (settings.clj:148-155), `remote-sync-check-changes-cache-ttl-seconds` (settings.clj:157-163).

### `RemoteSyncTask`

Defined in `enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_task.clj` (table `:remote_sync_task`).

- One row per import/export operation.
- Lifecycle helpers: `create-sync-task!` (line 36), `update-progress!` (line 70), `set-version!` (line 86, stores the git SHA), `complete-sync-task!` (line 96), `fail-sync-task!` (line 107), `cancel-sync-task!` (line 55), `conflict-sync-task!` (line 226).
- Status query helpers: `current-task` (line 118 — most recent active task that's reported progress within `remote-sync-task-time-limit-ms`), `most-recent-task` (line 135), `last-version` (line 147 — the git SHA of the most recent successful task; used as "the local version").
- A `before-insert` hook (line 28) prevents creating a new task while one is active.

### `RemoteSyncObject`

`enterprise/backend/src/metabase_enterprise/remote_sync/models/remote_sync_object.clj` (table `:remote_sync_object`).

- Per-entity dirty tracking. Statuses: `create`, `update`, `delete`, `removed`, `synced`.
- `dirty?` (line 22) and `dirty-objects` (line 34) drive the "you have unsaved changes" UI.

### `Source` / `SourceSnapshot` protocols

`enterprise/backend/src/metabase_enterprise/remote_sync/source/protocol.clj`.

- `Source` (line 5): `branches`, `create-branch`, `default-branch`, `snapshot`.
- `SourceSnapshot` (line 35): `list-files`, `read-file`, `write-files!`, `version`.
- The only implementation today is `GitSource` / `GitSnapshot` (see §6).

---

## 5. HTTP API — `/api/ee/remote-sync/*`

All endpoints in `enterprise/backend/src/metabase_enterprise/remote_sync/api.clj`. All require superuser.

| Method | Route | Function | What it does |
|---|---|---|---|
| POST | `/import` | `defendpoint :post "/import"` (api.clj:22-47) | Imports from `branch` (defaults to `(settings/remote-sync-branch)`), via `impl/async-import!` |
| GET | `/is-dirty` | api.clj:49-54 | Boolean: any `RemoteSyncObject` with status ≠ `synced`? |
| GET | `/has-remote-changes` | api.clj:56-74 | Compares current remote SHA with `RemoteSyncTask`/`last-version`; cached |
| GET | `/dirty` | api.clj:76-83 | List of dirty entities |
| POST | `/export` | api.clj:85-115 | Exports to `branch` (or `remote-sync-branch`); requires `:read-write` |
| GET | `/current-task` | api.clj:117-121 | Most recent task with hydrated `:status` |
| POST | `/current-task/cancel` | api.clj:123-129 | Sets `cancelled=true` on running task |
| PUT | `/settings` | api.clj:131-182 | Updates remote-sync settings + per-collection sync state in one call |
| GET | `/branches` | api.clj:184-201 | `git ls-remote` filtered to `refs/heads/*` |
| POST | `/create-branch` | api.clj:203-225 | Creates new branch from current branch's last imported version, **and switches `remote-sync-branch` to it** (api.clj:216) |
| POST | `/stash` | api.clj:227-251 | Creates new branch from current `remote-sync-branch`, then async-export to it |

---

## 6. The Git Source (JGit)

`enterprise/backend/src/metabase_enterprise/remote_sync/source/git.clj`.

### Repo storage

- The bare repo lives at `<java.io.tmpdir>/metabase-git/<sha1(remote-url:token)>` — see `repo-path` (git.clj:99-100).
- Cloned bare (`.setBare true`) at git.clj:114-117 in `clone-repository!`.
- An in-memory cache of `Git` instances: `jgit` atom (git.clj:416) keyed by repo-path, populated by `get-jgit` (git.clj:430-438).
- On stale-cache exceptions ("Missing commit"), `clear-cached-repo!` (git.clj:423) wipes the directory and the atom; `snapshot` (git.clj:449-462) retries once after clearing.

### JGit configuration

`enterprise/backend/src/metabase_enterprise/remote_sync/init.clj:14-35` installs an isolated `SystemReader` so JGit ignores host-level git config (`~/.gitconfig`, `/etc/gitconfig`). This is why your local `[user]` block doesn't bleed in.

### Authentication

- `credentials-provider` multimethod (git.clj:47-64) dispatches on the URL host. Default uses `UsernamePasswordCredentialsProvider("x-access-token", token)` (GitHub/GitLab convention). Bitbucket uses `x-token-auth`.
- All remote operations go through `call-remote-command` (git.clj:66-79) which sets the credentials and increments analytics counters.

### Branch operations

- `branches` (git.clj:333-345) — `lsRemote` filtered to `refs/heads/*`, sorted, prefix stripped. **This is a remote call, not a local list.**
- `default-branch` (git.clj:241-256) — reads `HEAD` symbolic ref via `lsRemote`.
- `create-branch` (git.clj:374-399):
  1. Fetches.
  2. Calls `delete-branches-without-remote!` (git.clj:356-372) — **deletes any local branches that no longer exist on the remote.** This keeps the local cache clean.
  3. Resolves `base-commit-ish`, refuses if the new branch already exists.
  4. Updates the ref locally and pushes.
- `commit-sha` (git.clj:149-158) resolves a branch name (or any commit-ish) to a full SHA against the local clone.
- `qualify-branch` (git.clj:81-84) prepends `refs/heads/` if missing.

### Snapshots

A "snapshot" is a point-in-time view of a branch (a `GitSnapshot` record at git.clj:401-414). `snapshot*` (git.clj:440-447):

1. `fetch!` from origin.
2. Resolve `(:branch source)` to a SHA via `commit-sha`.
3. Wrap as `GitSnapshot{:git :remote-url :branch :version :token :managed-dirs}`.

`SourceSnapshot/list-files`, `read-file`, `write-files!`, and `version` operate on this immutable SHA.

### Writing

`write-files!` (git.clj:258-331):

- Builds an in-core `DirCache` containing the new file set.
- For files outside `managed-dirs` (legal top-level paths from the serdes) it copies forward existing tree entries.
- For files inside managed dirs but missing from the write set, it drops them — that's how renames/deletes propagate.
- Creates a `CommitBuilder` with author/committer `Metabase Library <library@metabase.com>`, parented at the branch tip.
- Updates the branch ref locally, then `push-branch!` (git.clj:211-232) — failures throw if any `RemoteRefUpdate` returns anything other than `OK` / `UP_TO_DATE`.

### Building a source from settings

`source.clj:84-97` `source-from-settings`:

- Pulls `remote-sync-url`, `remote-sync-branch`, `remote-sync-token` from settings.
- `managed-dirs` defaults to `serialization/legal-top-level-paths`.
- Optional 1-arity form lets callers override the branch.

---

## 7. Async Tasks: `import!` and `export!`

All in `enterprise/backend/src/metabase_enterprise/remote_sync/impl.clj`.

### Two predicates for "is anything running?"

There are two predicates with deliberately different semantics:

**`current-task`** (`models/remote_sync_task.clj:118-133`) — uses a staleness window:

```sql
WHERE started_at IS NOT NULL
  AND ended_at IS NULL
  AND last_progress_report_at > now() - remote-sync-task-time-limit-ms
```

If a task hasn't reported progress recently, it drops out of `current-task` even though `ended_at` is still NULL. That's deliberate — it lets the auto-import job recover from a hung task by allowing a new one to be created after the timeout (default 5 min).

**`task-running?`** (`guards.clj`) — strict, no staleness:

```sql
WHERE started_at IS NOT NULL AND ended_at IS NULL
```

Returns true for *any* row that's started and not ended. Catches stalled or hung tasks too. This is what user-driven operations consult.

### Two-tier behavior

The two predicates back two different behaviors:

- **User-driven operations** (`POST /import`, `POST /export`, `PUT /settings`, `POST /create-branch`, `POST /stash`) all call `guards/ensure-no-active-task!` at the top, which uses strict `task-running?`. If anything is alive, refuse with 400. Users have agency: they can cancel a stuck task explicitly via `POST /current-task/cancel`. The trade-off is that a JVM-died-mid-task orphan blocks user actions until cancelled (see #36 in the follow-up list).

- **Automatic operations** (the Quartz auto-import job at `task/import.clj:31`) call `create-task-with-lock!` directly without `ensure-no-active-task!`, so they use the staleness-aware `current-task`. Auto-imports self-heal: if the previous task hasn't reported progress in 5 min, the next auto-import creates a new task and supersedes the stale one (see below).

### `create-task-with-lock!` and supersession

`impl.clj:336-356`:

```clojure
(defn create-task-with-lock! [task-type]
  (cluster-lock/with-cluster-lock ::remote-sync-task
    (if-let [task (remote-sync.task/current-task)]
      (assoc task :existing? true)
      (do
        (remote-sync.task/supersede-stale-tasks!)
        (remote-sync.task/create-sync-task! task-type api/*current-user-id*)))))
```

When the staleness branch is taken (no `current-task`, but stale rows might still be hanging around), `supersede-stale-tasks!` (`models/remote_sync_task.clj`) marks any rows with `started_at` set, `ended_at` nil, and `last_progress_report_at` older than the timeout as `cancelled = true`, `ended_at = now`, `error_message = "Superseded after staleness timeout"`. The stale row is now structurally terminated, so future `task-running?` checks pass and user-driven ops can run again *after* the auto-import path discovered the orphan.

### `handle-task-result!` is robust against late completions

`handle-task-result!` (impl.clj:443-477) reads the task at entry and short-circuits if it's already terminated:

```clojure
(let [task (t2/select-one :model/RemoteSyncTask :id task-id)]
  (cond
    (nil? task) (log/warnf "Task %s missing during result handling; skipping" task-id)
    (some? (:ended_at task))
    (log/warnf "Task %s already terminated; skipping result handling to preserve state" task-id)
    :else (case (:status result) ...)))
```

This protects two scenarios:
- **Manual cancel mid-task**: admin runs `POST /current-task/cancel` while the virtual thread is still working. `cancel-sync-task!` sets `ended_at`. The thread eventually reaches `handle-task-result!`, sees `ended_at` set, and exits without writing the setting or overwriting the cancellation bookkeeping.
- **Stale task superseded by auto-import**: same protection — once `supersede-stale-tasks!` has set `ended_at` on the old row, the late-arriving thread does no damage.

### What the cluster lock still does

The lock around `create-task-with-lock!`'s body remains, narrower in scope than the operation-level guards:

- Holds for the duration of the SELECT-then-INSERT (or SUPERSEDE-then-INSERT). Released before the virtual thread starts.
- Prevents two concurrent task-creation requests from both observing "no current task" and both inserting.
- Does *not* serialize task execution.
- Does *not* serialize settings writes — those go through `ensure-no-active-task!` instead.

A DB-level partial unique index on `WHERE ended_at IS NULL` would replace the cluster lock with a structural invariant. That's tracked as a follow-up (#33 in the task list).

### Running the task

`run-async!` (impl.clj:435-457):

```clojure
(let [{task-id :id existing? :existing? :as task} (create-task-with-lock! task-type)]
  (api/check-400 (not existing?) "Remote sync in progress")    ; ← 400 if collision
  (u.jvm/in-virtual-thread*
    (dh/with-timeout {:interrupt? true
                      :timeout-ms (* (settings/remote-sync-task-time-limit-ms) 10)}
      (handle-task-result!
       (try (sync-fn task-id)
            (catch Exception e {:status :error :message (source-error-message e)}))
       task-id branch))))                                       ; ← branch from caller
```

Key points:

- The HTTP request returns the new task immediately; the actual work runs on a virtual thread.
- `dh/with-timeout` (`diehard.core`) interrupts the task at `10×` the configured task time limit.
- The `branch` argument bound to `run-async!` is captured in the closure and **passed to `handle-task-result!` regardless of any settings changes that happened in between.** ⚠️

### `handle-task-result!`

impl.clj:413-433:

```clojure
(defn handle-task-result! [result task-id & [branch]]
  (case (:status result)
    :success  (do (t2/with-transaction [_]
                    (when branch
                      (settings/remote-sync-branch! branch))   ; ← writes the setting
                    (remote-sync.task/complete-sync-task! task-id))
                  (invalidate-remote-changes-cache!))
    :conflict (do (remote-sync.task/set-version! task-id (:version result))
                  (remote-sync.task/conflict-sync-task! task-id (:conflicts result)))
    :error    (remote-sync.task/fail-sync-task! task-id (:message result))
    (remote-sync.task/fail-sync-task! task-id "Unexpected Error")))
```

**This is the only place outside `api.clj:216` (`create-branch`) where `remote-sync-branch` is mutated via `remote-sync-branch!`.** Every successful import/export overwrites the branch setting with whatever `branch` was bound when the task was kicked off. (`PUT /settings` also writes the setting, via `setting/set!` in `check-and-update-remote-settings!` at `settings.clj:213-217`.)

### `import!`

impl.clj:223-294. High-level flow:

1. Take a snapshot, get its `version` (SHA).
2. If `not force?` and `version == last-imported-version`, no-op.
3. Build an ingestable wrapped with `path-filters` from `serialization/legal-top-level-paths`.
4. Detect transforms via `snapshot-has-transforms?` (impl.clj:26-49) — used to auto-toggle the `remote-sync-transforms` setting.
5. `get-conflicts` (impl.clj:174-221) checks for entity-id collisions, library/transforms/snippets feature mismatches, etc.
6. If first-import + conflicts + not force, return `{:status :conflict …}`.
7. Otherwise: `serdes/with-cache` → `serialization/load-metabase!` → in a transaction, `remove-unsynced!` + `sync-objects!`.
8. `set-version!` task to the snapshot SHA.

Failure paths route through `handle-import-exception` (impl.clj:156-172) and `source-error-message` (impl.clj:120-154) — the latter classifies network, auth, branch, and stale-cache errors into user-facing strings.

### `export!`

impl.clj:296-334. Calls `spec/extract-entities-for-export`, streams via `source/store!` (`source.clj:66-82`), updates all `RemoteSyncObject` to `synced`.

### Public entry points

- `async-import!` (impl.clj:459-475) — checks dirty state, calls `run-async!` with `branch`.
- `async-export!` (impl.clj:477-495) — checks for remote-side changes, calls `run-async!` with `branch`.

### `finish-remote-config!`

impl.clj:497-511. A post-hook that runs at the end of every `PUT /api/ee/remote-sync/settings` call (invoked at api.clj:179). Its job is to make a settings change actually take effect by doing the follow-up work the caller didn't do directly.

It picks one of three paths based on the new settings state:

1. **Remote-sync is enabled AND branch is blank** → fill the branch in by querying the remote's `HEAD` via `source.p/default-branch` (usually `main` or `master`). Handles "admin enabled remote-sync without specifying a branch."
2. **Remote-sync is enabled AND mode is `:read-only`** → kick off `async-import!` of the current branch with `force=true`. This is **the mechanism that actually loads content into the app DB** after a read-only branch change. Without it, changing the branch field in admin settings would update the setting but leave the live content stale.
3. **Remote-sync is disabled** → call `collection/clear-remote-synced-collection!` to drop synced content.

**Why the name is a bit misleading.** It sounds like it just tidies settings. In practice (path 2) it triggers a substantial async side effect. The name comes from the original "finish initial setup" use case; the same code path is now reused for every read-only settings PUT.

**Why `:read-write` doesn't use it for branch changes.** In read-write mode, the dropdown calls `POST /import` directly, which does the content load itself. `finish-remote-config!` only triggers an import in `:read-only` mode, where the only branch-changing UI is the admin settings PUT.

**Its role in the GHY-3505 race.** In the §10 walkthrough, Bob's `PUT /settings` does two things:

1. `check-and-update-remote-settings!` (settings.clj:188-217) writes `remote-sync-branch=main` directly via `setting/set!`. **This is unconditional and not lock-protected — it happens even if the import in step 2 fails.**
2. `finish-remote-config!` runs and tries `async-import!` against `main`. If a task is already in flight, `create-task-with-lock!` returns `existing? true`, `async-import!` throws 400, and the exception propagates up.

So Bob's `PUT` may actually error out at step 2, but the setting write in step 1 has already happened and is *not* rolled back. The UI might display "import failed" while the setting genuinely says `main`. Later, the in-flight task finishes and `handle-task-result!` overwrites the setting back to its captured branch.

### Auto-import (read-only)

`enterprise/backend/src/metabase_enterprise/remote_sync/task/import.clj` runs a Quartz job at `remote-sync-auto-import-rate` minute intervals (default 5).

- `auto-import!` (task/import.clj:19-39) only runs when `remote-sync-enabled` AND `remote-sync-type = :read-only` AND `remote-sync-auto-import` is on.
- Reads `(settings/remote-sync-branch)` at run time (line 24), takes a snapshot, skips if SHA matches `last-version`.
- Crucially: calls `(impl/handle-task-result! (impl/import! snapshot task-id) task-id)` — **without a branch argument** (line 39), so on success it does NOT mutate `remote-sync-branch`. ✅

### "Has remote changes?" cache

impl.clj:350-409. A single in-process atom `remote-changes-cache` with a TTL from `remote-sync-check-changes-cache-ttl-seconds` (default 60s). Invalidated when the cached `:branch` differs from `remote-sync-branch`, when the TTL expires, when `force-refresh?`, or after every import/export via `invalidate-remote-changes-cache!` (impl.clj:359-362, called from `handle-task-result!` :success).

---

## 8. Frontend Branch UI

### Visibility

`enterprise/frontend/src/metabase-enterprise/remote_sync/hooks/use-git-sync-visible.ts:16-30`:

```ts
const isVisible = !!(isRemoteSyncEnabled && isAdmin && currentBranch && syncType === "read-write");
```

`currentBranch` is read from `useAdminSetting(BRANCH_KEY)` — i.e., from session-properties (`BRANCH_KEY = "remote-sync-branch"` at `enterprise/frontend/src/metabase-enterprise/remote_sync/constants.ts:15`). The branch dropdown only shows in read-write mode.

### Branch dropdown

`enterprise/frontend/src/metabase-enterprise/remote_sync/components/GitSyncControls/GitSyncControls.tsx`:

1. `handleBranchSelect` (GitSyncControls.tsx:80-108):
   - If selected branch == current → no-op.
   - Sets `nextBranch` (used by the spinner and the conflict modal).
   - Refetches `/dirty` (`useRemoteSyncDirtyState`).
   - If dirty AND not a brand-new branch → dispatches `syncConflictVariantUpdated("switch-branch")` to open `SyncConflictModal`.
   - Otherwise calls `changeBranch(branch, isNewBranch)`.

2. `changeBranch` (GitSyncControls.tsx:60-78):
   - If not a new branch, calls `importChanges({ branch })` — i.e., `POST /api/ee/remote-sync/import` with that branch in the body.
   - Tracks an analytics event.
   - Clears `nextBranch`.

3. `BranchDropdown` (GitSyncControls/BranchDropdown.tsx):
   - Lists branches from `useGetBranchesQuery()` (= `GET /branches`).
   - Inline branch creation: `useCreateBranchMutation()` → `POST /create-branch`. On success calls `onChange(newName, true)`. The "true" means `isNewBranch`, so `changeBranch` skips the import call (the `create-branch` endpoint already switched the setting on the server).

### Conflict modal

`enterprise/frontend/src/metabase-enterprise/remote_sync/components/SyncConflictModal/mutation-wrappers.ts`:

- `useDiscardChangesAndImportAction` (line 113-136) — `importChanges({ branch: targetBranch, force: true })`. Used when the user confirms "discard local changes and switch".
- `useStashToNewBranchAction` (line 56-110) — `createBranch` then `exportChanges` to that new branch. Used to "stash" current uncommitted edits.
- `usePushChangesAction` (line 17-54) — `exportChanges({ branch, force })`.

### Listener middleware

`enterprise/frontend/src/metabase-enterprise/remote_sync/middleware/remote-sync-listener-middleware.ts`:

- Opens the progress modal on `importChanges/exportChanges` pending (lines 67-104).
- Watches `getRemoteSyncCurrentTask` results (lines 113-147); on terminal-state success, invalidates `ALL_INVALIDATION_TAGS` (lines 35-65) so every cached collection / card / dashboard / transform refetches.

---

## 9. The Branch-Switch Flow End-to-End

User clicks a branch in the dropdown:

1. **Frontend** (`GitSyncControls.tsx:80`) → `handleBranchSelect(branch)` → refetch `/dirty`.
2. If dirty: open `SyncConflictModal`. User picks "discard and switch" → `mutation-wrappers.ts:122` calls `importChanges({ branch, force: true })`.
3. If clean: `GitSyncControls.tsx:68` calls `importChanges({ branch })`.
4. **API** `POST /api/ee/remote-sync/import` (api.clj:22) → `impl/async-import! branch force {}`.
5. **`async-import!`** (impl.clj:459-475):
   - Builds a `GitSource` for the requested branch via `source/source-from-settings branch`.
   - If dirty AND not force, throws 400.
   - Calls `run-async! "import" branch (fn [task-id] (import! (source.p/snapshot source) task-id …))`.
6. **`run-async!`** (impl.clj:443-457):
   - `create-task-with-lock!` — if a task is already running, returns `:existing? true` and the endpoint throws 400 ("Remote sync in progress").
   - Otherwise inserts a new `RemoteSyncTask` and runs the import on a virtual thread.
7. **`import!`** (impl.clj:223-294):
   - JGit `fetch` → take a snapshot → load via serdes → reconcile `RemoteSyncObject` → `set-version!` to the SHA.
8. **`handle-task-result!`** (impl.clj:413-433) on `:success`:
   - **`(settings/remote-sync-branch! branch)`** — writes the branch the task was started with.
   - `complete-sync-task!`.
   - `invalidate-remote-changes-cache!`.
9. Frontend's `getRemoteSyncCurrentTask` listener fires on terminal state, invalidates session-properties, the `BRANCH_KEY` setting refetches, the dropdown shows the new branch.

---

## 10. The "Branch switches back" Bug (GHY-3505) — and what fixed it

Linear ticket: *"Switching from a dev branch back to `main` in stats can automatically switch back to the dev branch instead of staying on `main`."*

### The original mechanism

`handle-task-result!` on successful task completion wrote the **branch captured when the task started** into `remote-sync-branch`, with no check that the setting had been changed in the meantime. A long-running task started for branch X would overwrite any switch to branch Y that happened during its run. The race was reachable through several paths because the operation that *changed* the setting (`PUT /settings`, `POST /create-branch`) and the task that *captured* the branch ran without coordination.

### A concrete walkthrough

Setup: instance is in `:read-only` mode (the typical configuration for a consume-only stats deployment, where content originates in git and Metabase mirrors it). Both `main` and `transforms-cleanup` exist on the remote. Two admins, Alice and Bob. Setting starts on `main`.

In read-only mode, branch switching happens through **Admin → Settings → Remote Sync → Branch text input**, which sends `PUT /api/ee/remote-sync/settings`. That endpoint writes the setting via `check-and-update-remote-settings!` (settings.clj:213-217) and then calls `finish-remote-config!` (impl.clj:497-511), which kicks off an `async-import!` against the new branch in `:read-only` mode. The settings write itself is **not lock-protected**.

| Time | Alice | Bob | `remote-sync-branch` | In-flight task |
|---|---|---|---|---|
| T0 | (idle) | (idle) | `main` | — |
| T1 | Goes to Admin → Settings → Remote Sync. Changes Branch to `transforms-cleanup` and saves. Frontend sends `PUT /settings`. Backend writes the setting, then `finish-remote-config!` calls `async-import!` against `transforms-cleanup`. Task A is created with captured branch `"transforms-cleanup"`. | | `transforms-cleanup` | A: `transforms-cleanup` |
| T2 | (import running — slow because the branch has lots of content, ~40s) | Loads Admin → Settings → Remote Sync. Sees Branch is `transforms-cleanup`. He wanted `main`. Changes Branch to `main` and saves. | `transforms-cleanup` | A: `transforms-cleanup` |
| T3 | (still running) | `PUT /settings` writes the setting directly: `setting=main`. **PUT /settings does not consult the cluster lock**, so the write succeeds even though task A is in flight. Then `finish-remote-config!` calls `async-import!` against `main`, which 400s with "Remote sync in progress" because task A holds the lock. Bob's settings save returned 200 (the settings PUT itself succeeded), the import got swallowed, but the setting *is* `main`. | `main` | A: `transforms-cleanup` |
| T4 | (still running) | UI re-polls, the dropdown / form shows `main`. Bob is satisfied. | `main` | A: `transforms-cleanup` |
| T5 | Task A completes successfully. `handle-task-result! :success` runs `(settings/remote-sync-branch! "transforms-cleanup")` — the captured branch from A's closure. | | `transforms-cleanup` | — |
| T6 | UI shows `transforms-cleanup`, content is loaded for `transforms-cleanup`. From Alice's perspective, her switch worked normally. | UI re-polls. Form shows `transforms-cleanup`. **Bob's setting was silently reverted to a branch he never asked for.** | `transforms-cleanup` | — |

What Bob experienced: "I set the branch to `main`. It was `main` for about 30 seconds. Then it changed back to `transforms-cleanup` automatically." That's GHY-3505.

### Single-user variants of the same race

The bug is about a closure (the captured branch) racing with a global setting. It doesn't depend on who initiates each side.

- **One user, two tabs.** Tab 1 starts a switch in admin settings (creates the in-flight task). Tab 2 changes the branch again before the first switch finishes. Mechanically identical to the two-admin walkthrough — the test `branch-stomp-race-two-tab-test` produces a byte-identical failure to the two-user test.
- **One user, one tab.** Possible in read-only mode if the user navigates back to the form during a slow import and changes the branch a second time. Whether the SyncProgressModal blocks this is a UI question; at the API level nothing prevents it.

### Where the setting can be written from

Because the bug hinges on "something writes the setting while a task is in flight," it's worth being explicit about *all* the paths that can write `remote-sync-branch`:

| Path | UI surface | Takes cluster lock? | Available in |
|---|---|---|---|
| Branch dropdown → `POST /import` (impl.clj:426 on success) | App-bar dropdown | ✅ Yes | `:read-write` only |
| Admin settings form → `PUT /settings` (settings.clj:213-217, sync write) | Admin → Remote Sync, Branch text input | ❌ No | `:read-only` only (field is hidden in read-write) |
| `POST /create-branch` (api.clj:216, sync write) | "Create branch …" in the dropdown picker, OR direct API | ❌ No | both modes |
| Push/Export → `handle-task-result!` :success | Push button (read-write), or any export | ✅ Yes for the task itself, but writes the setting at completion | `:read-write` only via UI |
| Direct API (curl, scripts, automation) | none — bypasses UI | ❌ No | both modes |
| Direct DB write to the `setting` table | none | ❌ No | both modes (atypical) |

In `:read-only` mode the only UI path to change the branch is the admin form, which doesn't take the lock. In `:read-write` mode the typical dropdown goes through the lock — but `POST /create-branch` from the picker bypasses it.

### Why the lock doesn't save us

The cluster lock at `create-task-with-lock!` (impl.clj:336-346) prevents two tasks from running simultaneously. It does **not** prevent setting writes from racing with a running task, because:

- `PUT /settings` writes via `setting/set!` in `check-and-update-remote-settings!` (settings.clj:213-217). It does not consult the lock.
- `POST /create-branch` (api.clj:216) writes the setting synchronously inside the request. It does not consult the lock.

So an in-flight task and a setting write can always interleave, and the task's `handle-task-result!` will win the last write.

### The other writers, for completeness

`remote-sync-branch` is mutated from three places in the EE backend (`grep` for `remote-sync-branch!` shows two; the third uses the lower-level `setting/set!`):

- `impl.clj:426` — `handle-task-result!` :success. ⚠️ The buggy one.
- `api.clj:216` — `POST /create-branch`. Synchronous, no async task; safe.
- `settings.clj:213-217` — inside `check-and-update-remote-settings!`, called from `PUT /settings`. Synchronous, no lock; this is the path Bob uses to write `main` in the walkthrough.

The auto-import Quartz job (`task/import.clj:39`) deliberately calls `handle-task-result!` **without** a branch argument, so it cannot stomp the setting. ✅

### What shipped

The fix coordinates every code path that mutates remote-sync state, and adds defense-in-depth so that even if something bypasses the coordination, the system can't enter an inconsistent state.

**1. Operation-level guard.** `guards/ensure-no-active-task!` consults `task-running?` (strict, no staleness) and throws a 400 if any task is alive. Called at the top of:
- `impl/async-import!` — `POST /import`, switch-branch via dropdown
- `impl/async-export!` — `POST /export`, push
- `impl/create-branch!` — `POST /create-branch` (extracted helper)
- `impl/stash!` — `POST /stash` (extracted helper)
- `core/bulk-set-remote-sync` — collection sync flag changes
- `settings/check-and-update-remote-settings!` — the body of `PUT /settings`

In Bob's walkthrough above (T8), the `PUT /settings` would now throw immediately and Bob's UI would surface the 400. The setting is unchanged. Alice's export completes and writes `transforms-cleanup` — but she was already on `transforms-cleanup`, so the write is a no-op semantically. Bob never sees an automatic switch.

**2. Fail-early in import!/export!.** `async-import!` and `async-export!` capture the setting value at scheduling time (`pre-task-branch`) and pass it to `import!`/`export!`. The work function checks at entry: if `pre-task-branch` no longer matches the current setting (would only happen if something bypassed the operation guard), abort with `:error` so the load doesn't run against a different branch than what was scheduled.

**3. `handle-task-result!` is robust against late completions.** The function reads the task at entry and bails if `ended_at` is already set (e.g., admin cancel + still-running thread, or auto-import supersession). No setting overwrite, no overwriting cancellation bookkeeping.

**4. Auto-import self-heals via supersession.** The Quartz auto-import job intentionally bypasses `ensure-no-active-task!` and goes through `create-task-with-lock!` directly. When `current-task` reports nil (because the previous task is stale per the staleness window), `supersede-stale-tasks!` marks all rows with `last_progress_report_at` older than the timeout as cancelled+terminated, then a new task is created. The orphan is cleaned up; auto-imports keep flowing even if a JVM died mid-task.

### What's *not* fixed (deliberately, design-level)

- **Two admins want different branches.** Inherent to the single-shared-branch design. Each admin's switch is visible to the other.
- **Long-stuck user-driven tasks.** A task whose JVM died mid-flight blocks user-driven operations until an admin runs `POST /current-task/cancel`. Tracked as #36 (orphan recovery on JVM startup) in the follow-ups.
- **Concurrent execution window during auto-import supersession.** When the auto-import supersedes a stale task, both the new task and the old (perhaps still-running) thread can briefly run concurrently. For auto-imports this is usually idempotent (same branch, same content), but the proper fix is the canceling/cancelled handshake (#32 in the follow-ups).

### Tests covering the fix

- `guards-test/*` — predicate semantics, including the stalled-task case.
- `*-refuses-while-task-running-test` (in `impl-test`, `core-test`, `settings-test`, `api-test`) — every guarded operation refuses correctly, no observable side effects.
- `models.remote-sync-task-test/supersede-stale-tasks!-*` — supersede logic.
- `impl-test/create-task-with-lock!-supersedes-stale-tasks-test` — wiring of supersession into task creation.
- `impl-test/handle-task-result!-skips-already-terminated-task-test` — late completion is a no-op.

---

## 11. Useful Tests / Pointers

- Backend tests live under `enterprise/backend/test/metabase_enterprise/remote_sync/` (mirrors the source layout).
- Frontend unit tests live next to their source files (`*.unit.spec.tsx`).
- E2E examples exist as fixture content at `e2e/support/assets/example_synced_collection/` and `e2e/support/assets/example_synced_transforms_collection/`.

### Test inventory for the GHY-3505 fix

**Predicate semantics** (`guards-test`):
- `task-running?-returns-false-when-no-tasks-test`
- `task-running?-returns-true-while-task-is-active-test`
- `task-running?-returns-false-when-task-has-ended-test`
- `task-running?-catches-stalled-tasks-test`

**Operation-level guards** (one per guarded function):
- `impl-test/async-import!-refuses-while-task-running-test`
- `impl-test/async-export!-refuses-while-task-running-test`
- `impl-test/create-branch!-refuses-while-task-running-test`
- `impl-test/stash!-refuses-while-task-running-test`
- `core-test/bulk-set-remote-sync-refuses-while-task-running-test`
- `settings-test/check-and-update-remote-settings!-refuses-while-task-running-test`

**API-level boundary** (one per HTTP endpoint that should refuse):
- `api-test/import-refuses-while-task-running-test`
- `api-test/export-refuses-while-task-running-test`
- `api-test/settings-refuses-while-task-running-test`
- `api-test/create-branch-refuses-while-task-running-test`
- `api-test/stash-refuses-while-task-running-test`

**Late-completion robustness**:
- `impl-test/handle-task-result!-skips-already-terminated-task-test`

**Supersession** (`models.remote-sync-task-test`):
- `supersede-stale-tasks!-marks-stale-task-cancelled-test`
- `supersede-stale-tasks!-leaves-brand-new-tasks-alone-test`
- `supersede-stale-tasks!-leaves-active-tasks-alone-test`
- `supersede-stale-tasks!-leaves-terminated-tasks-alone-test`
- `impl-test/create-task-with-lock!-supersedes-stale-tasks-test`

### Manual / integration testing

For a local Metabase instance, the easiest way to set up a test repo:

```bash
mkdir -p /tmp/sync-src && cd /tmp/sync-src
git init -b main
# add some collections/.../*.yaml content
git add . && git commit -m seed
git checkout -b dev
# tweak content
git commit -am dev-variant
git checkout main
cd .. && git clone --bare /tmp/sync-src /tmp/sync-target.git
```

Configure Metabase **Admin → Settings → Remote Sync** with:
- URL: `file:///tmp/sync-target.git`
- Token: (leave blank)
- Branch: `main`
- Type: `:read-only` or `:read-write`

Manual scenarios to exercise:
- `:read-only` mode: change the Branch field while `remote-sync-auto-import` is mid-fetch — endpoint returns 400 "Remote sync task in progress."
- `:read-write` mode: branch dropdown is disabled while a task runs (frontend pre-empts the bug).
- Manual cancel: start a long task, hit `POST /current-task/cancel`, observe that even if the underlying thread continues, no late setting writes happen.
- Auto-import recovery: kill the JVM mid-auto-import, restart, wait for the next auto-import tick — the previous task is marked `Superseded after staleness timeout` in `remote_sync_task` and the new one runs.
