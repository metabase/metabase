# Data app resources

A data app runs in a browser sandbox as one of its viewers, not as its author. Those viewers reach
Metabase through a permission group that can read exactly one collection: the app's own. So a query
the app runs, and an action it triggers, have to be reachable **through that collection** or they
fail on permissions.

The app's `resources/` directory makes that true. It holds serdes YAML for the app's collection, a
saved question per query, and copies of the models, actions, and metrics those use. The author (in
practice, an agent following the data-app skills) writes that YAML from the app's definitions. Nothing
changes in Metabase until the repository is pulled: the pull loads the files (see
`metabase_enterprise/data_apps/resource_load.clj`), so a local experiment can't break the running app,
and the saved questions never get ahead of the app code that is deployed.

`check-resources` reads nothing from Metabase; `print-resources` asks it for the export.

## What an app declares

Two directories at the data-app root, beside `package.json`:

```
queries/orders.query.ts     export const RevenueQuery = defineQuery({ savedQuestionEntityId: "…", source: schema.tables.orders })
actions/orders.action.ts    export const CreateOrder = defineAction({ copiedActionEntityId: "…", action: schema.models.orders.actions.create })
```

Nothing else is scanned: definitions under `src/` are invisible to both commands, which is a common
authoring mistake.

## What `resources/` holds

```
data_app.yaml                      collection: <entity ID of resources/collection.yaml>
resources/collection.yaml          the app's resource collection
resources/cards/*.yaml             a saved question per query, and copies of the models and metrics they use
resources/actions/*.yaml           a copy of each action, on the copy of its model
```

An action's permissions resolve through its parent model's collection
(`metabase.actions.models`, `perms-objects-set`), so making an action reachable means copying its
model into the app's collection and the action onto that copy. Metrics a query uses are copied for the
same reason, and the question reads the copy. Every saved question and copy is written from what
`print-resources` prints, whose references are already in the form the YAML uses, with new entity IDs
and references rewritten to the copies.

## `print-resources`

`embedding-sdk-react data-apps print-resources [file]` (`export.ts`) sends the evaluated definitions (all
of them, or those in `file`, relative to the app directory) to `POST /api/apps/export-resources`, with the
instance and API key from `.env.local`, and prints the answer as JSON: the saved question Metabase
writes for each `defineQuery` definition, each `defineAction`'s source action, the models those actions
belong to, and the metrics the queries aggregate, all as serialization writes them, each beside the
definition's file and entity ID. The saved question is complete: named after the export, in the
collection `data_app.yaml` names, with the definition's `savedQuestionEntityId`, created by the API
key's user, and holding the query Metabase builds with the same `createTestQuery` code the dev preview
runs. Every entity comes in the key order serialization writes a file and without the keys serialization
leaves unset, which the format omits, so the author transcribes rather than composes. An item that can't
be built or copied comes back with its `error`; the rest still come back.

## `check-resources`

`embedding-sdk-react data-apps check-resources` (`check.ts`) checks only what a repository pull can't:
the pull validates `resources/` on its own, never against the app's code. It fails, listing every
problem, for:

- a definition without its entity ID, or naming one no file holds, or a query naming a card that isn't
  a question: the pull would load, and the app would fail at runtime in production;
- a question or action no definition names: the pull would load it into the app's collection, and a
  leftover action is one more write the app's viewers can run.

It runs at `buildStart` for production builds, so `npm run build` fails the same way. The YAML's format
is `validate-schema`'s job (the template's `npm run validate-resources`), and the rest of the resource
rules (the collection, where copies live, duplicate or foreign entity IDs, the layout) are the pull's.
Nothing checks that a saved question's query matches its definition.

## Discovery evaluates the definitions

`discover.ts` bundles every file under `queries/` (or `actions/`) into one module with esbuild,
evaluates it, and takes every exported object as a definition: `defineQuery` and `defineAction`
return their argument as is, and the two directories hold nothing else. A definition a second file
re-exports keeps its identity through the single bundle, so it counts once. Anything that isn't a
definition is rejected by the export endpoint's schema, not here.

## Dev preview vs production build

The entity IDs only take effect in a production build. `isDataAppDev()` gates both swaps, so an app
runs against the original table and the authored action before its resources exist:

|              | Dev preview         | Production                                   |
| ------------ | ------------------- | -------------------------------------------- |
| query source | the table           | the saved question (`savedQuestionEntityId`) |
| action       | the authored action | the copy (`copiedActionEntityId`)            |

Both swaps live in the bundle (`toSourceInput` and `toExecutableActionId`), not in app code, so an
author passes the definition and never branches on the environment.
