# Collegiate Notebook to Metabase Handoff

This repo is the Metabase side of the conversion.

## Source Folder

`/Users/kurtishmistry/Documents/Collegiate-Python-Notebooks`

## Generated Files

- `/private/tmp/collegiate_notebook_inventory.json`
  - Notebook-level read/file/column/chart-cell inventory.
- `/private/tmp/collegiate_visualisation_manifest.json`
  - One row per rendered visualisation, including source code and placeholder
    Metabase fields.
- `/private/tmp/collegiate_visualisation_manifest.csv`
  - Spreadsheet-friendly version of the same queue.
- `/private/tmp/collegiate_metabase_scaffold.json`
  - Created Metabase collection/dashboard IDs.

## Current Count

343 rendered visualisations across 15 notebooks.

## Contract for the Python-Notebook Codex

For each row in `/private/tmp/collegiate_visualisation_manifest.json`, fill or
append enough information for Metabase import:

- `status`: `ready`, `blocked`, or `drop`.
- `metabase_database_id`: database id to run the SQL against.
- `metabase_sql`: native SQL that reproduces the dataframe behind the visual.
- `metabase_visualization`: Metabase display type, for example `line`, `bar`,
  `combo`, `table`, `scalar`, `pie`, or `row`.
- `notes`: any chart settings that matter, such as x-axis, breakout, metric,
  stacking, cumulative logic, filters, or why it is blocked.

If source CSV/XLSX files are required, record their absolute paths in `notes`.
The Metabase side cannot create faithful cards until the source data is mapped
to uploaded database tables or native SQL.

## Metabase Side Status

- Inventory generation is working.
- Dashboard/collection scaffold exists in
  `scripts/collegiate_metabase_scaffold.py`.
- `localhost:3001` is running.
- The `Collegiate Python Reports` root collection and 15 notebook dashboards
  have been created.
- Verified StarRez snapshots now exist in database id 2:
  - `starrez_data.collegiate_next_year_most_recent`: 3,602 rows, term
    `2026/2027`.
  - `starrez_data.collegiate_this_year_most_recent`: 9,014 rows, term
    `2025/2026`.
- Imported first-pass report dashboards:
  - `Next Year Most Recent` collection 38, dashboard 35, cards 40-45.
  - Notebook-specific This Year ready-row imports from the Python-side importer:
    cards 46-49.
  - `This Year Most Recent` collection 39, dashboard 36, cards 50-55.
  - `Year-on-Year Most Recent` collection 40, dashboard 37, cards 56-61.
- `scripts/collegiate_metabase_import_ready_cards.py` will import rows marked
  `ready` once `metabase_database_id` and `metabase_sql` are filled.
- Current blocker: remaining visuals that require Last Year, Two Years Ago,
  room inventory, budgets, eligibility, incentive, weekly reporting, or
  cancellation files still need their StarRez/source reports mapped to database
  tables.
- Blocker summary: `/private/tmp/collegiate_conversion_blockers.json`.

## Required Source Files

- `Next Year Most Recent.csv`
- `This Year Most Recent.csv`
- `Last Year Most Recent.csv`
- `Two Years Ago Data.csv`
- `Student Crowd - Rooms.csv`
- `Collegiate Weekly Reporting - 25-26.csv`
- `Rebooker eligibility report 26_27.csv`
- `All incentive code bookings 26-27.csv`
- `Rebooker eligibility report 25_26.csv`
- `This Year Most Recent - Cancelled.csv`

## Commands

```bash
python3 scripts/collegiate_notebook_inventory.py
python3 scripts/collegiate_visualisation_manifest.py
MB_URL=http://localhost:3001 MB_USER=... MB_PASSWORD=... python3 scripts/collegiate_metabase_scaffold.py
MB_URL=http://localhost:3001 MB_USER=... MB_PASSWORD=... python3 scripts/collegiate_metabase_import_ready_cards.py
```
