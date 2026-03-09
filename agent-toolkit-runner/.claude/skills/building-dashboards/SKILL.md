---
name: building-dashboards
description: Creates and manages Metabase dashboards with card placement, auto-layout, and filter wiring. Use when building dashboards, placing question cards on grids, or connecting dashboard filters to card fields.
---

# Building Dashboards

@./../_shared/field-resolution.md

## create-dashboard

Create a dashboard with cards and filters in one step.

```bash
./metabase-agent create-dashboard --json '<payload>'
```

Full JSON template:
```json
{
  "name": "Sales Dashboard",
  "description": "Q4 sales overview",
  "collection_id": 7,
  "cards": [
    {"card_id": 42, "width": 12, "height": 6},
    {"card_id": 43, "width": 6, "height": 4},
    {"card_id": 44, "width": 6, "height": 4}
  ],
  "filters": [
    {
      "name": "Date Range",
      "type": "date/range",
      "targets": [
        {"card_id": 42, "field": "created_at"},
        {"card_id": 43, "field": "order_date"}
      ]
    }
  ]
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | yes | | Dashboard name |
| `description` | no | | Dashboard description |
| `collection_id` | no | | Collection to save in |
| `cards` | no | | Cards to place (see layout below) |
| `cards[].card_id` | yes | | Question/card ID from `create-question` |
| `cards[].width` | no | 6 | Width in grid units (max 24) |
| `cards[].height` | no | 4 | Height in grid units |
| `cards[].row` | no | auto | Row position |
| `cards[].col` | no | auto | Column position |
| `filters` | no | | Dashboard-level filters |
| `filters[].name` | yes | | Label shown on dashboard |
| `filters[].type` | yes | | Filter widget type (see table below) |
| `filters[].targets` | yes | | Cards and fields this filter connects to |

Internally chains POST (create dashboard) + PUT (add cards and filters) in one command.

Output:
```json
{"id": 15, "name": "Sales Dashboard", "cards_added": 3, "filters_added": 1}
```

## Auto-Layout (24-Column Grid)

Cards are placed left-to-right, wrapping to the next row when a card exceeds column 24.

If `row` and `col` are both specified, those exact positions are used. Otherwise, auto-layout applies.

Common layout patterns:
```json
// Full width
{"card_id": 1, "width": 24, "height": 6}

// Two equal columns
{"card_id": 2, "width": 12, "height": 4},
{"card_id": 3, "width": 12, "height": 4}

// Three equal columns
{"card_id": 4, "width": 8, "height": 4},
{"card_id": 5, "width": 8, "height": 4},
{"card_id": 6, "width": 8, "height": 4}

// Four equal columns (KPI row)
{"card_id": 7, "width": 6, "height": 3},
{"card_id": 8, "width": 6, "height": 3},
{"card_id": 9, "width": 6, "height": 3},
{"card_id": 10, "width": 6, "height": 3}

// One wide + one narrow
{"card_id": 11, "width": 16, "height": 6},
{"card_id": 12, "width": 8, "height": 6}
```

## Dashboard Filter Types

| type | Widget | Use for |
|------|--------|---------|
| `date/range` | Date range picker | Date columns |
| `date/single` | Single date picker | Exact date |
| `date/month-year` | Month picker | Monthly filtering |
| `date/quarter-year` | Quarter picker | Quarterly filtering |
| `date/relative` | Relative date | Dynamic ranges (last 30 days) |
| `category` | Dropdown | String/enum columns |
| `id` | ID input | Numeric ID columns |
| `number` | Number input | Numeric columns |
| `string` | Text input | Free text |
| `string/contains` | Text (contains) | Partial match |
| `string/starts-with` | Text (starts-with) | Prefix match |

Filter targets use field names that are resolved automatically (see field-resolution.md).

## add-card-to-dashboard

Add a card to an existing dashboard with optional filter wiring.

```bash
./metabase-agent add-card-to-dashboard --json '<payload>'
```

```json
{
  "dashboard_id": 15,
  "card_id": 50,
  "width": 6,
  "height": 4,
  "filter_mappings": [
    {"filter_name": "Date Range", "field": "created_at"}
  ]
}
```

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `dashboard_id` | yes | | Dashboard ID |
| `card_id` | yes | | Card/question ID to add |
| `width` | no | 6 | Width in grid units |
| `height` | no | 4 | Height in grid units |
| `filter_mappings` | no | | Wire to existing dashboard filters |
| `filter_mappings[].filter_name` | yes | | Must match existing filter name (case-insensitive) |
| `filter_mappings[].field` | yes | | Field name on this card to wire to |

New card is placed at the bottom of the dashboard below all existing cards.

Output:
```json
{"dashboard_id": 15, "card_id": 50, "position": {"row": 8, "col": 0}}
```

## get-dashboard

```bash
./metabase-agent get-dashboard <id>
```

Output:
```json
{
  "id": 15,
  "name": "Sales Dashboard",
  "description": "Q4 overview",
  "parameters": [{"id": "abc12345", "name": "Date Range", "type": "date/range"}],
  "cards": [
    {"dashcard_id": 100, "card_id": 42, "card_name": "Revenue by Month",
     "size_x": 12, "size_y": 6, "row": 0, "col": 0}
  ]
}
```

Use this to see current layout before adding cards or to verify dashboard creation.

## Gotchas

- `card_id` is the `id` from `create-question`, NOT the `dashcard_id` shown in `get-dashboard`
- For SQL cards, filter wiring requires the card to have been run at least once (so `result_metadata` exists). Run the question in Metabase UI or use `execute-query` first.
- `add-card-to-dashboard` reads existing cards and PUTs the entire array back. It handles this correctly -- you just provide the new card.
- Filter `targets` use field names, not IDs. The field must exist on the card's source table or SQL result columns.
- Card `width` must be between 1 and 24. Common widths: 6 (quarter), 8 (third), 12 (half), 16 (two-thirds), 24 (full).
- Mixing auto-layout (no row/col) with explicit positions: auto-layout cards fill in array order. For predictable results, use all-auto or all-explicit.
