# Resource sync

A data app runs in a browser sandbox as one of its viewers, not as its author. Those viewers reach
Metabase through a permission group that can read exactly one collection: the app's own. So a query
the app runs, and an action it triggers, have to be reachable **through that collection** or they
fail on permissions.

Resource sync is the build-time step that makes that true. It reads the definitions an app commits
to source control, materializes them inside the app's collection, and writes back the generated IDs.
`npm run sync-resources` (`embedding-sdk-react data-apps sync-resources`) is the entry point.

The backend half — the collection and permission group themselves — lives in
`metabase_enterprise/data_apps/resources.clj`. See that module's README for how apps are served.

## What an app declares

Two directories at the data-app root, beside `package.json`:

```
queries/orders.query.ts     export const RevenueQuery = defineQuery({ source: schema.tables.orders })
actions/orders.action.ts    export const CreateOrder = defineAction({ action: schema.models.orders.actions.create })
```

Nothing else is scanned — definitions under `src/` are invisible to sync, which is a common
authoring mistake.

## The pipeline

`syncResources` (`sync.ts`) runs four steps:

1. **Discover** every `defineQuery` / `defineAction` in those directories (`discover.ts`).
2. **Ensure resources** — `POST /api/apps/:slug/draft` creates the app row if it doesn't exist
   yet, plus its collection and permission group.
3. **Reconcile queries** (`reconcile.ts`) — each authored query becomes a saved question in the
   collection, and its ID is injected back into the source as `savedQuestionSourceId`.
4. **Reconcile models** (`reconcile-models.ts`) — each declared action's model is copied into the
   collection, the action is copied onto that copy, and the copy's ID is injected back as
   `copiedActionId`.

## Why actions copy a whole model

An action's permissions resolve through its parent model's collection
(`metabase.actions.models`, `perms-objects-set`). Copying a card does **not** copy its actions —
`create-card!` writes one row and nothing traverses Card → Action — so making an action reachable
means copying its model _and_ recreating the action on that copy.

Models are therefore reference-counted by the actions that need them. The lockfile entry holds the
set of actions, not a count, because a count drifts across repeated runs while a set converges:

| Event                                 | Model           | Action                    |
| ------------------------------------- | --------------- | ------------------------- |
| action declared, model not yet copied | copy it         | recreate on the copy      |
| action declared, model already copied | reuse           | recreate just this action |
| declaration dropped, siblings remain  | keep            | delete that copied action |
| last declaration dropped              | delete the copy | cascade removes the rest  |

The last row is free: `action.model_id` is `ON DELETE CASCADE`, so deleting the copied model takes
its copied actions with it.

## Discovery is deliberately strict

`discover.ts` parses each file twice over. The TypeScript AST locates `defineQuery`/`defineAction`
calls and enforces that each one directly initializes a **named exported** variable with a single
object literal. The file is then bundled with esbuild and evaluated — **twice** — and the two results
compared, so a definition that isn't deterministic can't produce a fingerprint that changes under it.

Write-back re-parses from disk rather than reusing the AST from discovery, because reconciliation
injects sequentially and an earlier injection into the same file shifts every offset after it.

## The lockfile is ownership proof

`resources_metadata.json` is generated, committed, and never hand-edited:

```jsonc
{
  "queries": [
    { "tableId": 1, "hash": "v1:sha256:…", "savedQuestionSourceId": 54 },
  ],
  "models": [
    {
      "sourceModelId": 5,
      "copiedModelId": 80,
      "hash": "v1:sha256:…",
      "actions": [
        { "sourceActionId": 51, "copiedActionId": 91, "hash": "v1:sha256:…" },
      ],
    },
  ],
}
```

It is not a cache. It is the only evidence that a card or action in Metabase belongs to this app,
and every mutating path checks it first. The `hash` fields fingerprint the **source** payload — the
only way to notice that someone edited the upstream model or action, since nothing in the app's own
source changes when they do.

## Invariants

These hold across both reconcilers, and are what the tests are mostly about:

- **Nothing is mutated or deleted without lockfile proof**, plus a live ownership check — still a
  question/model, still in the app's collection, action still hanging off the copied model. Anything
  that has moved is refused with recovery instructions rather than silently touched.
- **The lockfile flushes after every single mutation**, so a crash mid-run leaves resumable state.
- **`404` is the only recoverable failure.** Any other status rethrows; recreate-after-404
  additionally requires lockfile proof.
- **On the backend, ownership is the foreign key, never the name.** A same-named group is refused,
  not adopted — adoption would hand its existing members the app's data access on a name match.

## Dev preview vs production build

Generated IDs only take effect in a production build. `isDataAppDev()` gates both swaps, so an app
runs against the original table and the authored action before it has ever been synchronized:

|              | Dev preview         | Production                                   |
| ------------ | ------------------- | -------------------------------------------- |
| query source | the table           | the saved question (`savedQuestionSourceId`) |
| action       | the authored action | the copy (`copiedActionId`)                  |

Both swaps live in the bundle — `toSourceInput` and `toExecutableActionId` — not in app code, so an
author passes the definition and never branches on the environment.

`checkResourcesSynced` runs at `buildStart` for production builds only. It re-reads the source and
the lockfile and fails the build when they disagree, so a stale app can't ship: a stale build isn't
broken, it's silently pointed at whatever the saved question was when it was last synced.
