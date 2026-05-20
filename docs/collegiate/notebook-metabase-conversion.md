# Collegiate Notebook to Metabase Conversion

This file tracks the migration of the Collegiate Python notebook reports into
Metabase collections, saved questions, and dashboards.

## Source Folder

Notebook source folder:

```text
/Users/kurtishmistry/Documents/Collegiate-Python-Notebooks
```

Current readable notebooks:

- `ASAF - MACROS 2026_27.ipynb`
- `Lavanda 2025_26 (1st of Oct Onwards).ipynb`
- `MACROS 2026_27.ipynb`
- `MERLIN HEIGHTS 2026_27.ipynb`
- `MIDDLE STREET 2026_27.ipynb`
- `NOVA 2026_27.ipynb`
- `PARK HOUSE 2026_27.ipynb`
- `PLUMMER HOUSE 2026_27.ipynb`
- `RE-BOOKERS 2026_27.ipynb`
- `RIVERSIDE WAY 2026_27.ipynb`
- `ROMAN HOUSE 2026_27.ipynb`
- `SHAFTESBURY HALL 2026_27.ipynb`
- `ST JAMES STREET 2026_27.ipynb`
- `TOWER 2026_27.ipynb`

Still not usable:

- `_EARLSDON STREET 2026_27.ipynb`: 220-byte AppleDouble metadata file, not
  notebook JSON.

## Required Input Data

The notebooks reference these files. They are not currently present in the
notebook folder, so the Metabase conversion is blocked until each dataset is
available in a database/table Metabase can query, or as CSV/XLSX files that we
can load into Postgres.

- `2627_incentive_cost_of_sales_portfolio.xlsx`
- `2627_incentive_cost_of_sales_summary_formatted.xlsx`
- `All incentive code bookings 26-27.csv`
- `Collegiate Weekly Reporting - 25-26.csv`
- `Last Year Most Recent - Cancelled.csv`
- `Last Year Most Recent.csv`
- `Next Year Most Recent.csv`
- `Rebooker eligibility report 25_26.csv`
- `Rebooker eligibility report 26_27.csv`
- `Rebooker_Budget_vs_Spend_2627.xlsx`
- `Student Crowd - Rooms.csv`
- `This Year Most Recent - Cancelled.csv`
- `This Year Most Recent.csv`
- `Two Years Ago Data.csv`
- `agent_booking_length_buckets_by_site.xlsx`
- `agent_booking_length_min_median_max_by_site.xlsx`
- `payment_breakdown_2526_by_property.xlsx`
- `payment_breakdown_2627_with_inventory.xlsx`

## Target Metabase Layout

Create one top-level collection:

```text
Collegiate Python Reports
```

Inside it, create one collection per notebook. Each collection should contain:

- one main dashboard
- one saved question per notebook visualization
- any supporting saved SQL models needed by that notebook

Example:

```text
Collegiate Python Reports
├── ASAF - MACROS 2026_27
│   ├── Dashboard
│   ├── Quick Performance Snapshot
│   ├── Total Bookings and Revenue in Context
│   ├── Week on Week Breakdown
│   ├── Occupancy Rate
│   └── ...
├── MACROS 2026_27
├── MERLIN HEIGHTS 2026_27
└── ...
```

## Shared SQL Foundation

Most notebooks repeat the same pandas logic with different property constants.
Before creating individual dashboard cards, build reusable SQL models/views for:

- cleaned booking records
- academic year mapping
- sales cycle start date and week number
- campaign-to-date and same-period windows
- booking channel reclassification
- rebooker classification
- agent normalization
- nationality normalization
- year-of-study buckets
- room type normalization
- contract length buckets
- site bed capacity
- site budget and occupancy targets

These shared models should be used by the saved questions so that notebook
dashboards stay consistent.

## Conversion Status

- Notebook inventory: done.
- Metabase server availability: done locally on `http://localhost:3001`.
- Frontend hot build availability: done locally on `http://localhost:8080`.
- Local dev admin reset:
  - Email: `admin@sudolondon.com`
  - Password: `Collegiate123`
- Source datasets: blocked. Required CSV/XLSX inputs are not present in the
  notebook folder.
- Metabase collection/dashboard scaffold: done.
- Saved questions: pending data source.

Created local Metabase IDs:

| Notebook | Collection ID | Dashboard ID |
|---|---:|---:|
| `ASAF - MACROS 2026_27.ipynb` | 6 | 2 |
| `Lavanda 2025_26 (1st of Oct Onwards).ipynb` | 7 | 3 |
| `MACROS 2026_27.ipynb` | 8 | 4 |
| `MERLIN HEIGHTS 2026_27.ipynb` | 9 | 5 |
| `MIDDLE STREET 2026_27.ipynb` | 10 | 6 |
| `NOVA 2026_27.ipynb` | 11 | 7 |
| `PARK HOUSE 2026_27.ipynb` | 12 | 8 |
| `PLUMMER HOUSE 2026_27.ipynb` | 13 | 9 |
| `RE-BOOKERS 2026_27.ipynb` | 14 | 10 |
| `RIVERSIDE WAY 2026_27.ipynb` | 15 | 11 |
| `ROMAN HOUSE 2026_27.ipynb` | 16 | 12 |
| `SHAFTESBURY HALL 2026_27.ipynb` | 17 | 13 |
| `ST JAMES STREET 2026_27.ipynb` | 18 | 14 |
| `TOWER 2026_27.ipynb` | 19 | 15 |

## Rebuild Inventory

Run:

```bash
python3 scripts/collegiate_notebook_inventory.py
```

The script prints a notebook summary and writes detailed JSON to:

```text
/private/tmp/collegiate_notebook_inventory.json
```

## Create Metabase Collection Scaffolding

Once Metabase is running and credentials are available:

```bash
MB_URL=http://localhost:3000 \
MB_USER=you@example.com \
MB_PASSWORD='your-password' \
python3 scripts/collegiate_metabase_scaffold.py
```

This creates the top-level `Collegiate Python Reports` collection, one child
collection per readable notebook, and one placeholder dashboard per notebook.
Saved questions are intentionally not created by this scaffold because they
depend on confirmed database tables and SQL model definitions.

## Local Dev Notes

For this Metabase checkout, the backend and frontend hot bundle server both
need to be running. If `http://localhost:3001` shows a white page, check that
the frontend server is also available:

```bash
nc -vz localhost 3001
nc -vz localhost 8080
```

The Metabase HTML should load JavaScript bundles from:

```text
http://localhost:8080/app/dist/app-main.hot.bundle.js
```

If both ports are available and the page is still blank, hard-refresh the
browser tab to clear the cached failed bundle load.
