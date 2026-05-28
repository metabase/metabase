---
name: metabase-use-question-query-custom-visualizations
description: Use when creating React custom visualizations from saved Metabase questions with the Embedding SDK useQuestionQuery hook.
---

# Metabase useQuestionQuery Custom Visualizations

## Core Rule

Use Metabase MCP tools for the Metabase side of the workflow. Do not skip straight to hand-written card IDs or app-only mock data.

IMPORTANT: Do not call HTTP APIs directly when an equivalent MCP tool exist.

## Workflow

1. Discover data with MCP `search`.
   - Search for the relevant tables, metrics, or existing questions.
   - Use exact database, schema, table, and column names from search results.

2. Build the query with MCP `construct_query`.
   - Prefer MBQL when it can express the question cleanly.
   - Use the portable MBQL 5 shape: top-level `{"lib/type":"mbql/query","stages":[...]}`.
   - Every clause has an options map at position 1, e.g. `["count", {}]`.
   - Field refs use portable names before construction, e.g. `["field", {}, ["Boba", "public", "orders", "ordered_at"]]`.

3. Verify results with MCP query execution before saving.
   - Run the constructed query with MCP `execute_query` or `query`.
   - Check the returned columns, row count, and first rows.
   - Make sure the result shape matches what the React visualization expects.

4. Save with MCP `create_question`.
   - Create the saved Metabase question using the MCP `create_question` tool.
   - Record the returned question ID in app code, preferably in a central constants file.
   - If `create_question` expects a base64 query string, pass the encoded query produced by the Metabase query-construction path. Do not pass a raw portable query JSON string. If the MCP wrapper only exposes a `query_handle`, verify how that server resolves handles before proceeding.

5. Render with `useQuestionQuery(questionId)`.
   - Wrap the React tree in `MetabaseProvider` with the app's auth config.
   - Call `useQuestionQuery(questionId)` inside a component under that provider.
   - Handle `isLoading`, `error`, and empty data explicitly.
   - Convert `data.columns` plus `data.rows` into a domain-specific chart/table model.

## useQuestionQuery Result Shape

The hook returns:

```ts
{
  data: {
    id: number | string;
    name: string;
    description: string | null;
    entityId: string;
    rowCount: number | null;
    runningTime: number | null;
    columns: DatasetColumn[];
    rows: unknown[][];
  } | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<void>;
}
```

Rows are arrays, not objects. Use `columns[index].name` or column type metadata to interpret each row value.

Example mapping:

```ts
const rows = useMemo(() => {
  if (!data) {
    return [];
  }

  const columnNames = data.columns.map((column) => column.name);

  return data.rows.map((row) =>
    Object.fromEntries(columnNames.map((name, index) => [name, row[index]])),
  );
}, [data]);
```

For chart-like custom visuals, inspect column metadata:

- Date/time columns often have `base_type` or `effective_type` containing `DateTime`.
- Category columns often have `effective_type: "type/Text"` or `semantic_type: "type/Source"`.
- Aggregations often have `source: "aggregation"` and names like `count`.

## Debugging Checklist

When the UI shows an empty state such as "No orders found":

1. Log the hook state: question ID, `isLoading`, `error`, `Boolean(data)`.
2. Log `data?.columns.map(c => c.name)` and `data?.rows.length`.
3. Log the first raw row and the first mapped row.
4. Query the saved question directly through Metabase to confirm it returns rows.
5. Confirm the component is rendered under `MetabaseProvider`.
6. Confirm the saved question ID in app code matches the MCP `create_question` response.

## Common Mistakes

- Passing a `query_handle` to `create_question` when that tool expects a base64 encoded query.
- Creating a saved question before executing the query once.
- Assuming `rows` are objects. They are arrays aligned with `columns`.
- Hard-coding column indexes without validating column names or types.
- Rendering `No data` while the SDK is still authenticating or loading.
- Creating a nested `MetabaseProvider` per component instead of sharing one provider at the app boundary.
