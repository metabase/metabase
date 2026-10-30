# Filter prototypes

This branch (`filters-prototype-base`) is the base for the filter prototypes. Each prototype is a branch off this one. This branch adds a mock dataset with many column types, and it makes some tables slow on purpose.

## Run it

You need [Docker](https://www.docker.com/products/docker-desktop/) and the usual Metabase dev setup (Java, Clojure CLI, Bun). Docker must be running.

```sh
bun run dev-prototype
```

This command:

1. Starts a Postgres container (`metabase-prototype-postgres`, port 55432). Metabase uses it as its app DB.
2. Starts Metabase like `bun run dev-ee`, at http://localhost:3000.

On the first start, Metabase creates the mock data and adds the **Prototype Data** database. This takes less than a minute after Metabase starts. Everybody gets the same data.

To stop Metabase, press `Ctrl+C`. The data stays in the container. To delete everything and start again from an empty instance:

```sh
docker compose -f prototype/docker-compose.yml down -v
```

If the Prototype Data database does not appear, look in the Metabase log for lines that start with `Prototype data:`.

## The data

Metabase writes the data into the `prototype_data` schema of its Postgres app DB. The generator is `src/metabase/prototype/dataset.clj`. It uses fixed random seeds, so the rows are the same on every machine.

| Table | Rows | Speed | Good for |
|---|---|---|---|
| `countries` | 46 | fast | world map, flags (ImageURL), arrays, percentages |
| `us_states` | 50 | fast | US state map, income, percentages |
| `stores` | 300 | fast | pin map, opening times, open and closed dates |
| `products` | 1,000 | fast | categories, prices, scores, images, JSON attributes, tags |
| `customers` | 5,000 | fast | avatars, emails, US and world locations, plans, enum status, IP addresses |
| `orders` | 100,000 | **slow** | currency, quantities, durations, shipping location, FKs to customers, products and stores |
| `web_events` | 150,000 | **slow** | UUIDs, URLs, devices and browsers, times of day, JSON properties |
| `reviews` | 25,000 | **slow** | 1–5 ratings, sentiment scores, long text, photos |
| `support_tickets` | 15,000 | **slow** | priorities (enum), assignees, durations, nullable dates |

The data covers these semantic types: PK, FK, Name, Title, Description, Comment, Category, Company, Subscription, Source, Owner, Email, URL, ImageURL, AvatarURL, IPAddress, City, State, Country, ZipCode, Latitude, Longitude, Price, Cost, GrossMargin, Income, Discount, Currency, Percentage, Score, Quantity, Duration, Birthdate, and the Creation, Join, Updated, Deletion and Cancelation timestamps and dates. It also has columns with no semantic type: booleans, dates, times, timestamps with and without time zone, UUIDs, Postgres enums, text arrays and JSON.

The semantic types come from `dataset.clj`, not from sync. Metabase saves them as user values, the same as when you change them in the data model admin. You can still change them in the admin.

## Slow and fast tables

When a user runs a query that reads a slow table, Metabase waits before it runs the query. The wait is a base delay of 5 seconds, times a factor for each table (Web Events ×2, Orders ×1, Support Tickets ×0.7, Reviews ×0.5), times a random 0.9 to 1.5, so runtimes vary like real ones. Queries that read only fast tables run without a wait. This applies to query builder questions, SQL questions, joins and dashboards. Cached results do not wait.

- To change the base delay, set `MB_PROTOTYPE_SLOW_QUERY_DELAY_MS`, or change the `prototype-slow-query-delay-ms` setting.
- To change the factors, edit `delay-factors` in `src/metabase/prototype/slow_queries.clj`.
- To make a different table slow or fast, change its `:slow?` in `src/metabase/prototype/dataset.clj`.

The run button and the loading spinner show how long a question usually takes, from its past runs in `query_execution`. After the setup creates the first admin, Metabase seeds a history of runs for each table, and the question "Purchases by device" in the "Runtime estimates" collection with its own runs. See `src/metabase/prototype/runtime_estimate.clj`.

The frontend can read which tables are slow:

```ts
const prototypeData = useSetting("prototype-data");
// { database_id: 2, slow_table_ids: [9, 15, 11, 13], fast_table_ids: [7, 14, 12, 10, 8] }
const delayMs = useSetting("prototype-slow-query-delay-ms");
```

## Prototype settings

The main menu (the button in the top-right corner of the app, where you switch to Admin or Data studio) has a **Prototype settings** item. Hover it to open a submenu with the settings of the current prototype. Use it to switch the options of a prototype while you look at it. On this branch there are no settings, so the submenu says "No settings for this prototype."

To add settings to a prototype:

1. In `frontend/src/metabase/prototype/settings.ts`, define and export each setting of your prototype, and add it to `PROTOTYPE_SETTINGS`. The submenu shows the settings in this order. Everything that `settings.ts` exports is available from `metabase/prototype`.
2. Read the value where you need it with `usePrototypeSetting`.

```ts
// frontend/src/metabase/prototype/settings.ts
import type { BooleanPrototypeSetting, PrototypeSetting } from "./types";

export const SHOW_FILTER_HINTS: BooleanPrototypeSetting = {
  type: "boolean",
  key: "show-filter-hints",
  label: "Show filter hints",
  description: "Show a short help text under each filter",
  defaultValue: true,
};

export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [SHOW_FILTER_HINTS];
```

```tsx
// in any component
import { SHOW_FILTER_HINTS, usePrototypeSetting } from "metabase/prototype";

const [showHints, setShowHints] = usePrototypeSetting(SHOW_FILTER_HINTS);
```

| Type | Control | Extra fields |
|---|---|---|
| `boolean` | switch | |
| `select` | dropdown | `options: [{ value, label }]` |
| `segmented` | segmented control (all options in one row) | `options: [{ value, label }]`, best for 2–4 short options |
| `number` | number input | `min`, `max` (optional) |
| `text` | text input | |

- Values are stored in the browser (local storage), per setting `key`. They stay after a reload. Each person has their own values.
- When a value changes, every component that reads that setting updates.
- If a stored value is not valid any more (for example, you removed a select option), the setting uses its `defaultValue`.
- To go back to the default values, clear the site data of the Metabase tab in the browser.

## Change the data

1. Change `src/metabase/prototype/dataset.clj`.
2. Increment `version` in the same file.
3. Restart Metabase.

On start, Metabase sees the new version, creates the `prototype_data` schema again and syncs the database. Questions that use the old tables keep their table and field IDs, because the table and column names stay the same.

## Other ways to run it

- **Worktrees (`wt`)**: the app DB of a worktree is Postgres, so the data appears automatically. Use `wt up`, not `bun run dev-prototype`: the `mise.local.toml` of the worktree overrides the database settings of `dev-prototype`.
- **Preview environments**: the app DB is Postgres, so the data should appear automatically. This is not tested yet.
- **H2 app DB** (plain `bun run dev`): there is no prototype data. Metabase logs a warning.

## Make a prototype

```sh
git checkout filters-prototype-base
git checkout -b filters-prototype-<idea>
```

With `wt`:

```sh
wt up filters-prototype-<idea> --from filters-prototype-base
```
