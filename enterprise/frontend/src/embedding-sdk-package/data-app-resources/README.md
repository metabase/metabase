# Data app resources

A data app runs in a browser sandbox as one of its viewers, not as its author. Those viewers reach
Metabase through a permission group that can read exactly one collection: the app's own. So a query
the app runs, and an action it triggers, have to be reachable **through that collection** or they
fail on permissions.

The files of the app's collection make that true. Under the repository's `collections/data_apps/`, the
folder of the `data-apps` collection namespace, they hold serdes YAML for the app's collection, a saved
question per query, and copies of the actions the app runs and of the metrics its queries use. The
author (in practice, an agent following the data-app skills) writes that YAML from the app's
definitions. Nothing changes in Metabase until the repository is pulled: the pull loads the files as
serialized content, like everything else the repository holds, so a local experiment can't break the
running app, and the saved questions never get ahead of the app code that is deployed.

`check-resources` reads nothing from Metabase; `print-resources` asks it for the export.

## What an app declares

Two directories at the data-app root, beside `package.json`:

```
queries/orders.query.ts     export const RevenueQuery = defineQuery({ savedQuestionEntityId: "…", source: schema.tables.orders })
actions/orders.action.ts    export const CreateOrder = defineAction({ copiedActionEntityId: "…", action: schema.actions.createOrder })
```

Nothing else is scanned: definitions under `src/` are invisible to both commands, which is a common
authoring mistake.

## What the app's collection holds

```
data_apps/<slug>/data_app.yaml                    collection: <entity ID of the app's collection>
collections/data_apps/<collection>.yaml           the app's collection, a root collection of the data-apps namespace
collections/data_apps/<collection>/*.yaml         a saved question per query, copies of the metrics they use, and a copy of each action
```

`<collection>` is the collection's name as serialization slugs it (`data_app__sales` for `Data App: Sales`).
The commands find the app's files by content, as a pull does: the collection whose `entity_id` the
manifest's `collection` names, and the cards and actions whose `collection_id` is it, wherever they sit
under `collections/data_apps/`. The repository is the directory that holds the app's `data_apps/`; an
app that isn't under `data_apps/` is its own root, so its files sit under its own `collections/`.

A data app runs only query actions that belong to no model, which the typed schema lists under
`schema.actions`. Such an action's permissions resolve through its own collection, so making it
reachable means copying it into the app's collection. Metrics a query uses are copied for the same
reason, and the question reads the copy. Every saved question and copy is written from what
`print-resources` prints, whose references are already in the form the YAML uses, with new entity IDs
and references rewritten to the copies.

## `print-resources`

`embedding-sdk-react data-apps print-resources [file]` (`export.ts`) sends the evaluated definitions (all
of them, or those in `file`, relative to the app directory) to `POST /api/apps/export-resources`, with the
instance and API key from `.env.local`, and prints the answer as JSON: the saved question Metabase
writes for each `defineQuery` definition, each `defineAction`'s source action, and the metrics the
queries aggregate, all as serialization writes them, each beside the definition's file and entity ID.
An action that belongs to a model comes back with an error. The endpoint answers only a superuser, so
the API key must be one in the Administrators group. The saved question is complete: named after the export, in the
collection `data_app.yaml` names, with the definition's `savedQuestionEntityId`, created by the API
key's user, and holding the query Metabase builds with the same `createTestQuery` code the dev preview
runs. Every entity comes in the key order serialization writes a file and without the keys serialization
leaves unset, which the format omits, so the author transcribes rather than composes. An item that can't
be built or copied comes back with its `error`; the rest still come back.

## `check-resources`

`embedding-sdk-react data-apps check-resources` (`check.ts`) checks only what a repository pull can't:
the pull validates the files on their own, never against the app's code. It fails, listing every
problem, for:

- a manifest that names no collection, or one whose collection has no file under
  `collections/data_apps/`: the pull refuses the app before it loads anything;
- a definition without its entity ID, or naming one no file in the app's collection holds, or a query
  naming a card that isn't a question: the pull would load, and the app would fail at runtime in
  production;
- a question or action no definition names: the pull would load it into the app's collection, and a
  leftover action is one more write the app's viewers can run.

It runs at `buildStart` for production builds, so `npm run build` fails the same way. The YAML's format
is `validate-schema`'s job (the template's `npm run check-resources` runs it after this check), and the rest of the resource
rules (the collection's namespace, duplicate or foreign entity IDs, what a card or action may hold) are the pull's.
Nothing checks that a saved question's query matches its definition.

## Discovery evaluates the definitions

`discover.ts` bundles every file under `queries/` (or `actions/`) into one module with esbuild,
evaluates it, and takes every exported object as a definition: `defineQuery` and `defineAction`
return their argument as is, and the two directories hold nothing else. A definition a second file
re-exports keeps its identity through the single bundle, so it counts once, for the first file that
exports it; `print-resources <file>` reads that file's exports alone, so a barrel doesn't claim them.
Anything that isn't a definition is rejected by the export endpoint's schema, not here.

Discovery refuses what makes a definition unusable on its own or against the others: an action that
doesn't reference a generated action, two definitions of one source action, two claiming one entity
ID. Every command needs that, `print-resources` included. What a definition lacks against the app's
collection files, its entity ID first of all, is `check-resources`' to report: `print-resources` is the
command an author runs to get that ID, so it must work without one.

## Dev preview vs production build

The entity IDs only take effect in a production build. `isDataAppDev()` gates both swaps, so an app
runs against the original table and the authored action before its resources exist:

|              | Dev preview         | Production                                   |
| ------------ | ------------------- | -------------------------------------------- |
| query source | the table           | the saved question (`savedQuestionEntityId`) |
| action       | the authored action | the copy (`copiedActionEntityId`)            |

Both swaps live in the bundle (`toSourceInput` and `toExecutableActionId`), not in app code, so an
author passes the definition and never branches on the environment.
