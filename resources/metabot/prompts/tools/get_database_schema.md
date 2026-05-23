This conversation is scoped to a single database. Use `get_database_schema` once at the start to get the **list of tables** in that database, then call `list_available_fields` with the table IDs you actually need to see columns and types.

## When to use

- Call it **once** at the start of a conversation to learn what tables exist.
- After the initial call, rely on the cached output in your own context — do not call it again.
- This tool intentionally does *not* return columns. Schemas are big; pulling every column for every table will blow the context window.

## Format

```
# DatabaseName

Tables in this database. Each line is `- [table_id] schema.name — description`. ...

## public
- [42] public.orders — Confirmed orders for products from users.
- [43] public.products — Product catalog.
```

The number in `[brackets]` is the `table_id` to pass to `list_available_fields`.

## Drilling in

When you actually need column details (types, descriptions, FKs, semantic types) for a table or a small set of related tables, call `list_available_fields` with the relevant `table_ids` (up to 20 per call). For sample values on a specific column, use `get_field_values`.

Search and `read_resource` are disabled in scoped mode — `get_database_schema` plus `list_available_fields` cover everything you need.
