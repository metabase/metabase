# Prototypes

This branch (`prototype-base`) is the base for prototypes of any part of Metabase. Each prototype is a branch off this one. This branch adds:

- A mock **Prototype Data** database with many column types. It is a real Postgres database.
- A **Prototype settings** submenu in the main menu, with the types and the controls for settings. It has no settings: each prototype adds its own.

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

| Table | Rows | Good for |
|---|---|---|
| `countries` | 46 | world map, flags (ImageURL), arrays, percentages |
| `us_states` | 50 | US state map, income, percentages |
| `stores` | 300 | pin map, opening times, open and closed dates |
| `products` | 1,000 | categories, prices, scores, images, JSON attributes, tags |
| `customers` | 5,000 | avatars, emails, US and world locations, plans, enum status, IP addresses |
| `orders` | 100,000 | currency, quantities, durations, shipping location, FKs to customers, products and stores |
| `web_events` | 150,000 | UUIDs, URLs, devices and browsers, times of day, JSON properties |
| `reviews` | 25,000 | 1–5 ratings, sentiment scores, long text, photos |
| `support_tickets` | 15,000 | priorities (enum), assignees, durations, nullable dates |

The data covers these semantic types: PK, FK, Name, Title, Description, Comment, Category, Company, Subscription, Source, Owner, Email, URL, ImageURL, AvatarURL, IPAddress, City, State, Country, ZipCode, Latitude, Longitude, Price, Cost, GrossMargin, Income, Discount, Currency, Percentage, Score, Quantity, Duration, Birthdate, and the Creation, Join, Updated, Deletion and Cancelation timestamps and dates. It also has columns with no semantic type: booleans, dates, times, timestamps with and without time zone, UUIDs, Postgres enums, text arrays and JSON.

The semantic types come from `dataset.clj`, not from sync. Metabase saves them as user values, the same as when you change them in the data model admin. You can still change them in the admin.

## Prototype settings

The main menu (the button in the top-right corner of the app, where you switch to Admin or Data studio) has a **Prototype settings** item. Hover it to open a submenu with the settings of the current prototype. Use it to switch the options of a prototype while you look at it. On this branch there are no settings, so the submenu says "No settings for this prototype."

To add settings to a prototype:

1. In `frontend/src/metabase/prototype/settings.ts`, define and export each setting of your prototype, and add it to `PROTOTYPE_SETTINGS`. The submenu shows the settings in this order. Everything that `settings.ts` exports is available from `metabase/prototype`.
2. Read the value where you need it with `usePrototypeSetting`.

```ts
// frontend/src/metabase/prototype/settings.ts
import type { BooleanPrototypeSetting, PrototypeSetting } from "./types";

export const SHOW_HINTS: BooleanPrototypeSetting = {
  type: "boolean",
  key: "show-hints",
  label: "Show hints",
  description: "Show a short help text under each field",
  defaultValue: true,
};

export const PROTOTYPE_SETTINGS: readonly PrototypeSetting[] = [SHOW_HINTS];
```

```tsx
// in any component
import { SHOW_HINTS, usePrototypeSetting } from "metabase/prototype";

const [showHints, setShowHints] = usePrototypeSetting(SHOW_HINTS);
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

- **Worktrees (`wt`)**: the app DB of a worktree is Postgres, so the data appears automatically. Use `wt up` with `--no-clone-db`, not `bun run dev-prototype`: the `mise.local.toml` of the worktree overrides the database settings of `dev-prototype`. The instance starts empty, so create the admin user in the setup page or with `POST /api/setup`.
- **Preview environments**: the app DB is Postgres, so the data appears automatically. The first start takes a few minutes.
- **H2 app DB** (plain `bun run dev`): there is no prototype data. Metabase logs a warning.

## Make a prototype

```sh
git checkout prototype-base
git checkout -b prototype-<idea>
```

With `wt`:

```sh
wt up prototype-<idea> --from origin/prototype-base --no-clone-db --host <short>
```

A change that every prototype needs (for example, a new setting type or new mock data) goes on `prototype-base`. Then rebase the prototype branches onto it.

## Share a prototype

Open a draft PR to `master` with the labels `do not merge`, `no-backport` and `PR-Env`. The `PR-Env` label deploys a preview environment. If the deploy is cancelled (this can happen when you add many labels at the same time), remove the `PR-Env` label and add it again.
