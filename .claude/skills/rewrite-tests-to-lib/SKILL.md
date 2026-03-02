---
name: rewrite-tests-to-lib
description: |
  Rewrite tests that rely on legacy MBQL to use the new lib-based
  tests helpers like `Lib.createTestQuery` and `H.createCardWithTestQuery`.
---

# Rewrite tests to use the new Lib-based test helpers

The legacy helpers take hand-written MBQL (`["field", id, opts]`, `"source-table"`,
`aggregation`, etc.). The new helpers take a small, typed spec that Lib resolves into a
real query on the backend. Columns are referenced by name instead of numeric field id,
so the specs are shorter and survive schema changes.

## Helper mapping

| Legacy helper | New helper | Notes |
| --- | --- | --- |
| `H.createQuestion` (structured) | `H.createCardWithTestQuery` | async, chain `.then(H.visitCard)` to visit |
| `H.createNativeQuestion` | `H.createCardWithTestNativeQuery` | async, chain `.then(H.visitCard)` to visit |
| `H.visitQuestionAdhoc` (structured) | `H.visitAdHocQuestionWithTestQuery` | note the exact casing: legacy is `Adhoc`, new is `AdHoc` |
| `H.visitQuestionAdhoc` (native) | `H.visitAdHocQuestionWithTestNativeQuery` | |
| `H.createQuestionAndDashboard` | none yet | **not convertible** until a `createDashboardWithTestQuery` helper exists |
| `H.createNativeQuestionAndDashboard` | none yet | same |

Unit tests (in `metabase-lib`) use `Lib.createTestQuery(metadataProvider, spec)` and
`Lib.createTestNativeQuery(metadataProvider, spec)`. These take a metadata provider as
the first argument and return a `Query`, not a card.

If you only need the raw `dataset_query` (no card, no visit), the e2e helpers
`H.createTestQuery(spec)` and `H.createTestNativeQuery(spec)` return the opaque
`dataset_query` directly.

## Workflow

1. Pick one file (or one scenario directory) at a time.
2. Find every legacy helper call using the mapping above.
3. Swap the helper name and rewrite the query into the new spec (sections below).
4. `bun run type-check-pure`. The specs are fully typed, so most shape mistakes
   surface here. Fix until clean.
5. Run the affected specs (see the `e2e-test` skill). This is not optional: a spec that
   references a wrong column or `sourceName` type-checks fine but resolves to a different
   query, so it only fails at runtime.
6. Self-review with the `e2e-test-review` skill before opening the PR.

## The new spec

The authoritative types live in `frontend/src/metabase-types/api/query.ts` (search for
`Test*Spec`). A structured query is a non-empty list of stages:

```ts
dataset_query: {
  database: SAMPLE_DB_ID,
  stages: [
    { source: { type: "table", id: ORDERS_ID }, /* clauses */ },
    /* later stages have no source; the source is the previous stage */
  ],
}
```

A column is referenced by name, not field id:

```ts
{ type: "column", name: "TOTAL", sourceName: "ORDERS" }
```

- `name` is the column name (`ORDERS.TOTAL` → `"TOTAL"`).
- `sourceName` disambiguates which source the column comes from. See the gotcha below:
  it is **not** always the uppercase table constant.
- `displayName` and `index` are further disambiguators when `name` + `sourceName` are not
  unique.

### Replacing the helper

`H.createQuestion` with a structured `query`:

```diff
-H.createQuestion(
-  { name: "Test", query: { "source-table": ORDERS_ID } },
-  { visitQuestion: true },
-);
+H.createCardWithTestQuery({
+  name: "Test",
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    stages: [{ source: { type: "table", id: ORDERS_ID } }],
+  },
+}).then(H.visitCard);
```

`H.createCardWithTestQuery` / `H.createCardWithTestNativeQuery` are async and resolve to
the created `Card`. `H.visitCard` takes that card (`{ id, type }`) and visits it; it
supports `question`, `model`, and `metric` types. It returns the card, so you can keep
chaining.

`H.visitQuestionAdhoc` maps directly, keeping its options (`{ mode?: "notebook",
skipWaiting?, autorun? }`, where `autorun` is native-only):

```diff
-H.visitQuestionAdhoc({
-  dataset_query: {
-    type: "query",
-    database: SAMPLE_DB_ID,
-    query: { "source-table": ORDERS_ID, filter: ["=", ["field-id", ORDERS.USER_ID], 1] },
-  },
-});
+H.visitAdHocQuestionWithTestQuery({
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    stages: [
+      {
+        source: { type: "table", id: ORDERS_ID },
+        filters: [
+          {
+            type: "operator",
+            operator: "=",
+            args: [
+              { type: "column", name: "USER_ID", sourceName: "ORDERS" },
+              { type: "literal", value: 1 },
+            ],
+          },
+        ],
+      },
+    ],
+  },
+});
```

### wrapId

The new helpers have no `wrapId`. Use the resolved card instead of a Cypress alias:

```diff
-H.createQuestion({ ... }, { wrapId: true });
-cy.get("@questionId").then((questionId) => /* use questionId */);
+H.createCardWithTestQuery({ ... }).then((card) => /* use card.id */);
```

If chaining nests too deeply, `cy.wrap(card.id).as("questionId")` inside the `.then` keeps
the alias.

## Clause reference

Each clause below lives inside a stage. `// ...` marks other stage clauses.

### source

```diff
-{ "source-table": ORDERS_ID }
+{ source: { type: "table", id: ORDERS_ID } }
```

Cards were `"card__123"`, now they are explicit:

```diff
-{ "source-table": "card__123" }
+{ source: { type: "card", id: 123 } }
```

### aggregations

An aggregation is an expression, optionally named (`{ name, value }`):

```diff
-{ aggregation: [["count"]] }
+{ aggregations: [{ type: "operator", operator: "count" }] }
```

```diff
-{ aggregation: [["sum", ["field", ORDERS.TOTAL, null]]] }
+{
+  aggregations: [
+    {
+      name: "Sum of Total",
+      value: {
+        type: "operator",
+        operator: "sum",
+        args: [{ type: "column", name: "TOTAL", sourceName: "ORDERS" }],
+      },
+    },
+  ],
+}
```

### breakouts

A breakout is a column plus optional binning (`unit`, `bins`, or `binWidth`):

```diff
-{ breakout: [["field", PRODUCTS.CREATED_AT, { "temporal-unit": "month" }]] }
+{ breakouts: [{ type: "column", name: "CREATED_AT", sourceName: "PRODUCTS", unit: "month" }] }
```

### filters

A filter is an expression. `filter` (singular) becomes `filters` (plural, a list):

```diff
-{ filter: [">", ["field", ORDERS.TOTAL, null], 100] }
+{
+  filters: [
+    {
+      type: "operator",
+      operator: ">",
+      args: [
+        { type: "column", name: "TOTAL", sourceName: "ORDERS" },
+        { type: "literal", value: 100 },
+      ],
+    },
+  ],
+}
```

Nest operators for compound filters (`and`, `or`):

```ts
{
  type: "operator",
  operator: "and",
  args: [
    { type: "operator", operator: ">", args: [/* ... */] },
    { type: "operator", operator: "<", args: [/* ... */] },
  ],
}
```

### expressions

The legacy `expressions` map becomes a list of `{ name, value }`:

```diff
-{ expressions: { "Sum of Total": ["+", ORDERS.TOTAL, 1] } }
+{
+  expressions: [
+    {
+      name: "Sum of Total",
+      value: {
+        type: "operator",
+        operator: "+",
+        args: [
+          { type: "column", name: "TOTAL", sourceName: "ORDERS" },
+          { type: "literal", value: 1 },
+        ],
+      },
+    },
+  ],
+}
```

### joins

Tables and columns are referenced by id/name, not field refs. `conditions` is optional:
omit it to use the suggested (foreign-key) join conditions.

```diff
-{
-  joins: [{
-    alias: "Products",
-    "source-table": PRODUCTS_ID,
-    strategy: "left-join",
-    condition: ["=", ["field", ORDERS.PRODUCT_ID, {}], ["field", PRODUCTS.ID, { "join-alias": "Products" }]],
-  }],
-}
+{
+  joins: [
+    {
+      source: { type: "table", id: PRODUCTS_ID },
+      strategy: "left-join",
+      conditions: [
+        {
+          operator: "=",
+          left: { type: "column", name: "PRODUCT_ID", sourceName: "ORDERS" },
+          right: { type: "column", name: "ID", sourceName: "PRODUCTS" },
+        },
+      ],
+    },
+  ],
+}
```

### order-by

```diff
-{ "order-by": [["asc", ["field", ORDERS.CREATED_AT, null]], ["desc", ["field", ORDERS.TOTAL, null]]] }
+{
+  orderBys: [
+    { type: "column", name: "CREATED_AT", sourceName: "ORDERS", direction: "asc" },
+    { type: "column", name: "TOTAL", sourceName: "ORDERS", direction: "desc" },
+  ],
+}
```

`direction` defaults to `"asc"`.

### fields

```diff
-{ fields: [["field", ORDERS.ID, null], ["field", ORDERS.TOTAL, null]] }
+{
+  fields: [
+    { type: "column", name: "ID", sourceName: "ORDERS" },
+    { type: "column", name: "TOTAL", sourceName: "ORDERS" },
+  ],
+}
```

### limit

```diff
-{ limit: 10 }
+{ limit: 10 }
```

Same value, just inside a stage.

## Multi-stage queries

A `"source-query"` becomes an earlier stage. Later stages have no `source`, so the
previous stage is the source. Reference columns produced by an earlier stage by name only
(no `sourceName`):

```diff
-{
-  "source-query": {
-    "source-table": ORDERS_ID,
-    aggregation: [["count"]],
-    breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
-  },
-  filter: [">", ["field", "count", { "base-type": "type/Integer" }], 5],
-}
+{
+  database: SAMPLE_DB_ID,
+  stages: [
+    {
+      source: { type: "table", id: ORDERS_ID },
+      aggregations: [{ type: "operator", operator: "count" }],
+      breakouts: [{ type: "column", name: "CREATED_AT", sourceName: "ORDERS", unit: "month" }],
+    },
+    {
+      filters: [
+        {
+          type: "operator",
+          operator: ">",
+          args: [
+            { type: "column", name: "count" },
+            { type: "literal", value: 5 },
+          ],
+        },
+      ],
+    },
+  ],
+}
```

## Native queries

Native specs need only minor rewriting:

- The `native: { query, "template-tags" }` wrapper is flattened: `query` and `templateTags`
  move to the top level of `dataset_query`.
- `template-tags` becomes camelCase `templateTags`.
- Drop boilerplate like `id` on individual tags.
- A field-filter tag's `dimension` changes from a field reference to a plain field id.

```diff
-H.createQuestion({
-  query: {
-    type: "native",
-    database: SAMPLE_DB_ID,
-    native: {
-      query: "SELECT * FROM orders [[WHERE {{total}}]]",
-      "template-tags": {
-        total: {
-          id: "abc123",
-          name: "total",
-          "display-name": "Total",
-          type: "dimension",
-          dimension: ["field", ORDERS.TOTAL, null],
-          "widget-type": "number/=",
-        },
-      },
-    },
-  },
-});
+H.createCardWithTestNativeQuery({
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    query: "SELECT * FROM orders [[WHERE {{total}}]]",
+    templateTags: {
+      total: {
+        type: "dimension",
+        name: "total",
+        "display-name": "Total",
+        dimension: ORDERS.TOTAL, // plain field id, not a field reference
+        "widget-type": "number/=",
+      },
+    },
+  },
+});
```

## Gotchas

- **`sourceName` is not always the table constant.** For a directly-queried table it is the
  table's name (`"ORDERS"`). For an implicitly-joined (foreign-key) column it is the target
  table's display name, e.g. `["field", PEOPLE.ID, { "source-field": ORDERS.USER_ID }]`
  becomes `{ type: "column", name: "ID", sourceName: "People" }`. When a conversion
  type-checks but the test fails, this is the first thing to check.
- **Drop `base-type` and field ids.** The spec resolves columns by name, so
  `{ "base-type": ... }` options and numeric field ids are not needed.
- **Silent failures.** A wrong `name`/`sourceName` still produces a valid query, just the
  wrong one. Always run the affected specs (step 5), do not rely on type-check alone.
- **Dates come from sample data.** Assertions on sample-data dates (e.g. `"April 2025"`)
  are periodically shifted on master. Do not change them during a conversion. Keep the
  existing expected values.
- **`createQuestionAndDashboard` has no equivalent yet.** Leave those calls alone until a
  dashboard test-query helper exists.
