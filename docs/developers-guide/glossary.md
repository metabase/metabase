---
title: Developer glossary
---

# Developer glossary

Shared vocabulary for Metabase contributors. Aim: same word means same thing across code, docs, PRs, support tickets, and UI copy.

This is a living doc. When you trip over a term, add it. When a term drifts, fix it here in the same PR that fixes the code.

## How to use

- Reach for these terms in PR titles, commit messages, code comments, and test names.
- In code review, cite this file when nudging on naming (`see glossary: prefer "transform run" over "job execution"`).
- If a term has different meanings in different modules, list each context explicitly.

## Conventions

- **Term** — canonical name.
- **Context** — module or surface where term applies. Different contexts may overload a term; that's fine if boundaries are explicit.
- **Definition** — one or two sentences.
- **Aliases / avoid** — older or UI-only names; prefer the canonical in code.
- **Code** — primary namespace, table, or symbol.

---

## Content

### Card

- **Context:** persistence, API, code throughout `metabase.queries.*`.
- **Definition:** A saved query plus its display configuration. Backing row in the `report_card` table.
- **Aliases / avoid:** "Question" (UI-only term for a Card with `type = "question"`). Don't rename `card` -> `question` in code; the UI/code split is load-bearing.
- **Code:** `metabase.queries.models.card`, `report_card` table.

### Question

- **Context:** UI, product copy, user-facing docs.
- **Definition:** A Card whose `type` is `"question"` (as opposed to `"model"` or `"metric"`).
- **Code:** `:type :question` on a Card row.

### Model

- **Context:** UI and code; a kind of Card.
- **Definition:** A curated Card meant to be a reusable starting point for other queries. Distinct from "model" in the Toucan/ORM sense (a Clojure record describing a DB table).
- **Aliases / avoid:** Don't say "dataset" in new code — that was the old name for the same concept.
- **Code:** `:type :model` on a Card row.

### Metric (v2)

- **Context:** UI and code; a kind of Card.
- **Definition:** A Card whose query defines a single aggregation reusable across questions and dashboards.
- **Aliases / avoid:** "v1 metric" / `metric` table is the legacy concept, being phased out. Default to "metric = Card with `:type :metric`" unless context demands otherwise.
- **Code:** `:type :metric` on a Card row.

### Dashboard

- **Context:** product, API, code.
- **Definition:** A collection of Dashcards laid out on a grid, parameterized by Dashboard parameters.
- **Code:** `metabase.dashboards.models.dashboard`, `report_dashboard` table.

### Dashcard

- **Context:** code, API.
- **Definition:** Placement of a Card (or text/heading/link card) on a Dashboard, with position, size, parameter mappings, and visualization overrides.
- **Aliases / avoid:** "Dashboard card" in prose is fine; in code, `dashcard` is the canonical token.
- **Code:** `report_dashboardcard` table.

### Query

- **Context:** MBQL, query processor.
- **Definition:** An MBQL map or native SQL string describing a single execution. Not a saved entity — a Card *contains* a query.
- **Code:** `:dataset_query` on a Card; `metabase.query-processor.*`.

### Collection

- **Context:** product, API, permissions.
- **Definition:** A hierarchical folder for Cards, Dashboards, and other Collections. Permission boundary.
- **Code:** `metabase.collections.models.collection`, `collection` table (materialized path in `location`).

### Pulse

- **Context:** legacy code only.
- **Definition:** The old name for a scheduled delivery of a Dashboard or Card to a channel. Being replaced by Notifications.
- **Aliases / avoid:** Do not use "Pulse" in new code or new docs. Use "Notification" / "Dashboard subscription" / "Alert".
- **Code:** `metabase.pulse.*` (legacy), `pulse` table.

### Notification

- **Context:** new notifications system.
- **Definition:** A scheduled or triggered delivery of content (Dashboard subscription, Alert) to a Channel. Replaces Pulse.
- **Code:** `metabase.notification.*`, `notification` / `notification_subscription` tables.

### Channel

- **Context:** notifications.
- **Definition:** A delivery target (email, Slack, webhook). Configured per instance, referenced by Notifications.
- **Code:** `metabase.channel.*`, `channel` table.

### Field

- **Context:** sync / metadata.
- **Definition:** A column of a Table in a synced database. One row in `metabase_field`.
- **Code:** `metabase.warehouse-schema.models.field`.

### Field (MBQL)

- **Context:** MBQL clauses.
- **Definition:** A field reference: `[:field id-or-name opts]`. Not the metadata row — the *reference* to it inside a query.
- **Code:** `metabase.lib.field`, `metabase.legacy-mbql.schema`.

### Table

- **Context:** sync / metadata.
- **Definition:** A synced table in a connected Database. One row in `metabase_table`.
- **Code:** `metabase.warehouse-schema.models.table`.

### Database

- **Context:** product, sync.
- **Definition:** A connected data warehouse / source. One row in `metabase_database`. Distinct from the *application database* (where Metabase stores its own state).
- **Code:** `metabase.warehouses.models.database`, `metabase_database` table.

### Application database

- **Context:** platform infra.
- **Definition:** The H2 / Postgres / MySQL DB where Metabase stores its own metadata (Cards, Users, Permissions, …). Distinct from any user's Database.
- **Aliases / avoid:** "app DB" is fine in prose; do not call it "the Metabase DB" (ambiguous).

### Transform

- **Context:** transforms module.
- **Definition:** A user-defined data transformation (SQL, Python) that materializes into a target Table on a schedule or on demand.
- **Code:** `metabase.transforms.*`.

### Transform run

- **Context:** transforms.
- **Definition:** A single execution of a Transform. Has status, started/finished timestamps, error if any.
- **Aliases / avoid:** Not "job", not "execution". The schedule is a Transform job; an individual fire is a run.

### Sandbox

- **Context:** permissions (enterprise).
- **Definition:** A row-level filter applied to a Table for users in a specific Group, restricting which rows they can query.
- **Code:** `metabase-enterprise.sandbox.*`.

### Workspace

- **Context:** enterprise workspaces.
- **Definition:** An isolated environment where a user can stage changes to Cards/Dashboards/Transforms without affecting the main instance.
- **Code:** `metabase-enterprise.workspaces.*`.

### Serdes

- **Context:** serialization.
- **Definition:** Export / import of content between Metabase instances via portable YAML. Short for "serialization / deserialization".
- **Code:** `metabase-enterprise.serialization.*`, `metabase.models.serialization`.

### Entity ID

- **Context:** serdes, API.
- **Definition:** A stable, instance-independent identifier (NanoID) used as the portable key across exports. Distinct from the local integer primary key.
- **Code:** `:entity_id` column on most content tables.

### Bounded context

- **Context:** this glossary, module design.
- **Definition:** A region of the system (usually a module) within which a term has one consistent meaning. Two contexts may use the same word with different meanings as long as the boundary is explicit (different namespace, different module).

---

## Contributing

1. Add the term where it fits alphabetically inside its section.
2. If the term overloads an existing entry, add a new entry with an explicit **Context** rather than editing in place.
3. Pair glossary edits with code or doc changes in the same PR when possible.
4. If you find a term in code that contradicts this file, fix one of them — pick the side that matches what domain experts (PM, support, users) actually say.
