# Module Edge Counts

Each row shows outgoing edges (where this module imports from another) and incoming edges (where another module imports from this one), grouped by the destination/source tier.

Tiers shown are the base tier from `frontend/lint/module-boundaries.mjs` (not the visualization sub-tier split).

## App

| Module | Out total | →App | →Feat | →Shar | →Basi | →Lib | →Othe | In total | App→ | Feat→ | Shar→ | Basi→ | Lib→ | Othe→ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `misc` | 37 |  | 5 | 27 | 1 | 4 |  |  |  |  |  |  |  |  |

## Feature

| Module | Out total | →App | →Feat | →Shar | →Basi | →Lib | →Othe | In total | App→ | Feat→ | Shar→ | Basi→ | Lib→ | Othe→ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `admin` | 23 |  |  | 18 | 1 | 4 |  | 3 | 1 | 1 | 1 |  |  |  |
| `dashboard` | 20 |  |  | 15 | 1 | 4 |  | 6 | 1 | 2 | 3 |  |  |  |
| `enterprise` | 40 |  | 3 | 31 | 1 | 5 |  |  |  |  |  |  |  |  |
| `public` | 14 |  | 2 | 8 | 1 | 3 |  | 1 | 1 |  |  |  |  |  |
| `query_builder` | 22 |  |  | 17 | 1 | 4 |  | 7 | 1 | 2 | 4 |  |  |  |
| `reference` | 12 |  |  | 7 | 1 | 4 |  | 2 | 1 |  | 1 |  |  |  |

## Shared

| Module | Out total | →App | →Feat | →Shar | →Basi | →Lib | →Othe | In total | App→ | Feat→ | Shar→ | Basi→ | Lib→ | Othe→ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `account` | 12 |  |  | 8 | 1 | 3 |  | 2 | 1 |  | 1 |  |  |  |
| `api` | 8 |  |  | 3 |  | 5 |  | 34 | 1 | 5 | 28 |  |  |  |
| `archive` | 7 |  |  | 4 | 1 | 2 |  | 13 |  | 4 | 9 |  |  |  |
| `auth` | 10 |  |  | 7 | 1 | 2 |  | 3 | 1 | 1 | 1 |  |  |  |
| `browse` | 15 |  |  | 10 | 1 | 4 |  | 5 | 1 | 1 | 3 |  |  |  |
| `collections` | 17 |  |  | 12 | 1 | 4 |  | 23 | 1 | 4 | 18 |  |  |  |
| `comments` | 8 |  |  | 4 | 1 | 3 |  | 1 |  |  | 1 |  |  |  |
| `common` | 25 |  |  | 19 | 1 | 5 |  | 41 | 1 | 6 | 34 |  |  |  |
| `custom-viz` |  |  |  |  |  |  |  | 1 |  | 1 |  |  |  |  |
| `data-grid` | 4 |  |  | 2 | 1 | 1 |  | 2 |  | 1 | 1 |  |  |  |
| `data-studio` | 15 |  |  | 10 | 1 | 4 |  | 10 | 1 | 2 | 7 |  |  |  |
| `databases` | 10 |  |  | 5 | 1 | 4 |  | 7 |  | 3 | 4 |  |  |  |
| `detail-view` | 11 |  |  | 7 | 1 | 3 |  | 4 | 1 |  | 3 |  |  |  |
| `documents` | 17 |  |  | 12 | 1 | 4 |  | 4 | 1 | 1 | 2 |  |  |  |
| `embedding` | 17 |  | 2 | 10 | 1 | 4 |  | 15 | 1 | 5 | 8 |  | 1 |  |
| `embedding-ee` | 10 |  |  | 6 | 1 | 3 |  | 2 |  | 1 | 1 |  |  |  |
| `embedding-sdk-package` | 6 |  | 1 | 2 | 1 | 2 |  | 1 |  | 1 |  |  |  |  |
| `embedding-sdk-shared` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `forms` | 7 |  |  | 3 | 1 | 3 |  | 17 |  | 4 | 13 |  |  |  |
| `history` |  |  |  |  |  |  |  | 2 | 1 |  | 1 |  |  |  |
| `hoc` | 4 |  |  | 2 | 1 | 1 |  | 8 | 1 | 2 | 5 |  |  |  |
| `home` | 13 |  |  | 8 | 1 | 4 |  | 2 | 1 |  | 1 |  |  |  |
| `hooks` | 5 |  |  | 4 |  | 1 |  | 18 | 1 | 5 | 12 |  |  |  |
| `i18n` | 2 |  |  | 1 |  | 1 |  | 10 |  | 3 | 7 |  |  |  |
| `metabase-shared` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `metadata` | 11 |  |  | 7 | 1 | 3 |  | 11 |  | 4 | 7 |  |  |  |
| `metrics` | 17 |  |  | 13 | 1 | 3 |  | 5 | 1 | 1 | 3 |  |  |  |
| `metrics-viewer` | 12 |  |  | 7 | 1 | 4 |  | 2 | 1 |  | 1 |  |  |  |
| `new` | 7 |  |  | 6 |  | 1 |  | 1 | 1 |  |  |  |  |  |
| `other` | 42 |  | 4 | 31 | 1 | 6 |  | 43 | 1 | 6 | 34 |  | 2 |  |
| `palette` | 13 |  |  | 8 | 1 | 4 |  | 7 | 1 | 2 | 4 |  |  |  |
| `pulse` | 4 |  |  | 2 |  | 2 |  | 5 |  | 2 | 3 |  |  |  |
| `querying` | 18 |  | 1 | 12 | 1 | 4 |  | 15 |  | 4 | 11 |  |  |  |
| `questions` | 12 |  |  | 9 | 1 | 2 |  | 8 |  | 3 | 5 |  |  |  |
| `router` | 1 |  |  | 1 |  |  |  | 4 | 1 | 2 | 1 |  |  |  |
| `search` | 12 |  |  | 8 | 1 | 3 |  | 6 | 1 | 1 | 4 |  |  |  |
| `setup` | 11 |  |  | 6 | 1 | 4 |  | 9 | 1 | 2 | 6 |  |  |  |
| `status` | 6 |  |  | 3 | 1 | 2 |  | 4 | 1 | 2 | 1 |  |  |  |
| `styled-components` | 8 |  |  | 4 | 1 | 3 |  | 14 | 1 | 4 | 9 |  |  |  |
| `timelines` | 13 |  |  | 9 | 1 | 3 |  | 2 | 1 | 1 |  |  |  |  |
| `transforms` | 19 |  |  | 13 | 1 | 5 |  | 5 | 1 | 1 | 3 |  |  |  |
| `types` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `urls` | 7 |  |  | 5 |  | 2 |  | 29 |  | 5 | 24 |  |  |  |
| `visualizations` | 19 |  | 1 | 12 | 1 | 5 |  | 26 | 1 | 6 | 19 |  |  |  |

## Basic

| Module | Out total | →App | →Feat | →Shar | →Basi | →Lib | →Othe | In total | App→ | Feat→ | Shar→ | Basi→ | Lib→ | Othe→ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `mlv1` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `ui` | 4 |  |  |  |  | 4 |  | 39 | 1 | 6 | 32 |  |  |  |

## Lib

| Module | Out total | →App | →Feat | →Shar | →Basi | →Lib | →Othe | In total | App→ | Feat→ | Shar→ | Basi→ | Lib→ | Othe→ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `analytics` | 3 |  |  |  |  | 3 |  | 25 | 1 | 5 | 19 |  |  |  |
| `css` |  |  |  |  |  |  |  | 30 | 1 | 6 | 22 | 1 |  |  |
| `env` |  |  |  |  |  |  |  | 10 |  | 1 | 6 | 1 | 2 |  |
| `metabase-types` | 3 |  |  | 2 |  | 1 |  | 46 | 1 | 6 | 36 | 1 | 2 |  |
| `mlv2` |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
| `schema` | 1 |  |  | 1 |  |  |  | 2 |  |  | 2 |  |  |  |
| `utils` | 2 |  |  |  |  | 2 |  | 44 | 1 | 6 | 34 | 1 | 2 |  |
