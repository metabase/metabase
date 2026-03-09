# Field Name Resolution

The CLI resolves human-readable field names to numeric Metabase field IDs automatically. You never need to look up field IDs manually.

## How It Works

1. You provide a field name string (e.g., `"created_at"` or `"Created At"`)
2. The CLI fetches table metadata via the API
3. It matches against both `name` (snake_case) and `display_name` (Title Case), case-insensitively
4. Table metadata is cached per session -- repeated lookups for the same table cost nothing

## Commands That Accept Field Names

- `create-segment` / `update-segment`: the `field` property in each filter
- `create-dashboard`: filter targets `field` property
- `add-card-to-dashboard`: filter_mappings `field` property

## Error Behavior

If a field name is not found, the error includes a closest-match suggestion and all available fields:

```json
{
  "error": "unknown_field",
  "message": "Field 'create_at' not found on table 5",
  "hint": "Did you mean 'created_at'? Available fields: id, created_at, total, status",
  "available_fields": ["id", "created_at", "total", "status"]
}
```

## Tips

- Run `get-table <id>` first to see all field names and types
- Prefer `name` (snake_case) over `display_name` -- it's more stable across locale changes
- Numeric string values like `"42"` pass through as numeric IDs without resolution
