---
name: rewrite-tests-to-lib
description: |
  Rewrite tests that rely on legacy MBQL to use the new lib-based
  tests helpers like `Lib.createTestQuery` and `Lib.createTestNativeQuery`.
---

# Rewrite tests to use the new Lib-based test helpers

This skill helps you rewrite tests that rely on legacy MBQL to use the new
lib-based tests helpers.

The new Lib-based test helpers are:

- in unit tests
  - `Lib.createTestQuery`: to create a structured query
  - `Lib.createTestNativeQuery`: to create a native query
- in e2e tests
  - `H.createTestQuery`: to create a structured query
  - `H.createTestNativeQuery`: to create a native query
  - `H.createCardWithTestQuery`: to create a card with a structured query
  - `H.createCardWithTestNativeQuery`: to create a card with a native query
  - `H.visitAdHocQuestionWithTestQuery`: to visit ad hoc questions with a
    structured query
  - `H.visitAdHocQuestionWithTestNativeQuery`: to visit ad hoc questions with a native query

## Step-by-step guide to rewriting e2e tests

e2e tests live in `e2e/test/scenarios/**/*.spec.{ts,js}`.

These are the steps we should take:

1. Identify the helpers we want to replace
2. Replace the helpers with their new counterparts
3. Rewrite the queries to match the new spec

### 1. Identify the helpers we want to replace

Given a test file, determine the helpers we want to replace.
These are the fixes we want to make eventually:

- `H.createQuestion` → `H.createCardWithTestQuery` or `H.createCardWithTestNativeQuery`
- `H.visitQuestionAdHoc` → `H.visitAdHocQuestionWithTestQuery` or `H.visitAdHocQuestionWithTestNativeQuery`

### 2. Replace the helpers

Replace `H.createQuestion` with `H.createCardWithTestQuery` if the `query` is `{ type: "query" }`, for example:

```diff
-H.createQuestion({
-  name: "Test question",
-  query: {
-    type: "query",
-    database: SAMPLE_DB_ID,
-    query: {
-      "source-table": ORDERS_ID
-    },
-  },
- },
- { visitQuestion: true });

+H.createCardWithTestQuery({
+  name: "Test question",
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    stages: [{
+      source: {
+        type: "table",
+        id: ORDERS_ID,
+      },
+    }]
+  }
+}).then(H.visitCard)
```

Or replace with `H.createCardWithTestNativeQuery` if the `query` is `{ type: "native" }`, for example:

```diff
-H.createQuestion({
-  name: "Test question",
-  query: {
-    type: "native",
-    database: SAMPLE_DB_ID,
-    query: "SELECT * FROM orders",
-  },
- },
- { visitQuestion: true });

+H.createCardWithTestNativeQuery({
+  name: "Test question",
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    query: "SELECT * FROM orders",
+  }
+}).then(H.visitCard)
```

Notes:

- the `H.createCardWithTestQuery` and `H.createCardWithTestNativeQuery` helpers
  are asynchronous, so you need to chain the `.then(H.visitCard)` call if you
  want to visit the card afterwards.
- Some of the other options for `H.createQuestion` are not available, like `wrapId`,
  you can rewrite the tests so that you don't need to use them. If that is too ugly, you can
  or the test becomes too nested you could always manually wrap the id in a `cy.wrap` call.
  For example:
  ```diff
  - H.createQuestion({ ... }, { wrapId: true })
  - cy.get("@questionId").then((questionId) => /* do stuff with questionId */)
  + H.createCardWithTestQuery({ ... }).then((card) => /* do stuff with card.id */)
  ```

### 3. Rewrite the queries to match the new spec

This is the meat of the skill. You will need to rewrite the queries from the legacy MBQL format to the new spec
that is used by the new lib-based test helpers.

I'll give some examples for each of the parts of a query.

Native queries will need very little rewriting, see section 4.

Have a look at the `Test...Spec` types in
`frontend/src/metabase-types/api/query.ts` to see the new format as it should
be quite self-explanatory.

#### 3.a stages

The new helpers explicitly requires stages to be an array of stages, so you need to rewrite the query to match that,
even if it only has one stage (which is very likely).

#### 3.b source

The first stage of an structured query must have a source, which is either a table or another card:

```diff
- {
-   "source-table": ORDERS_ID
- }
+ {
+   stages: [{
+     source: {
+       type: "table",
+       id: ORDERS_ID,
+     },
+   }]

```

Cards were previously referenced by with an id `card__${id}`, the new format makes this more explicit:

```diff
- {
-   "source-table": "card__123",
- }
+ {
+   stages: [{
+     source: {
+       type: "card",
+       id: 123,
+     },
+   }]
```

#### 3.c joins

The new format allows for multiple joins to be defined, and each join can have
multiple conditions.
Tables are referenced by their id like stage sources. Columns and cards are
referred by their name instead of explicitly building field references.

```diff
- {
-   // ...
-   joins: [{
-     fields: "all",
-     alias: "Products",
-     "source-table": PRODUCTS_ID,
-     strategy: "left-join",
-     condition: [
-       "=",
-       ["field", ORDERS.PRODUCT_ID, {}],
-       ["field", PRODUCTS.ID, { "join-alias": "Products" }],
-     ],
-   }],
- }
+ {
+   stages: [{
+     // ...
+     joins: [{
+       source: { type: "table", id: PRODUCTS_ID },
+       strategy: "left-join",
+       conditions: [{
+         operator: "=",
+         left: { type: "field", name: "PRODUCTS_ID", sourceName: "ORDERS" },
+         right: { type: "field", name: "ID", sourceName: "PRODUCTS" },
+       }],
+     }],
+   }],
+ }
```

#### 3.d expressions

There is a new expression format that is more explicit that hand-writing expression cluases:

```diff
- {
-   // ...
-   expressions: {
-     "Sum of Total": ["+", ORDERS.TOTAL],
-   },
- }
+ {
+   stages: [{
+     // ...
+     expressions: [{
+       name: "Sum of Total",
+       value: {
+         type: "operator",
+         operator: "+",
+         args: [{ type: "column", name: "TOTAL", sourceName: "ORDERS" }],
+       },
+     }],
+   }],
+ }
```

#### 3.e breakouts

Breakouts are now defined as a list of columns, instead of a map of column names to
expressions.

```diff
- {
-   // ...
-   breakout: [[
-     "field",
-     PRODUCTS.CREATED_AT,
-     { "temporal-unit": "month" },
-   ]],
- }
+ {
+   stages: [{
+     // ...
+     breakouts: [{
+       type: "column",
+       name: "CREATED_AT",
+       sourceName: "PRODUCTS",
+       unit: "month", // or bins or binWidth
+     }]
+   }]
+ }
```

#### 3.f aggregations

Aggregations follow the same format as expressions, but the name can be optional.

```diff
- {
-   // ...
-   aggregation: [["count"]],
- }
+ {
+   stages: [{
+     // ...
+     aggregations: [{
+       type: "operator",
+       operator: "count",
+    }],
+   }]
+ }
```

#### 3.g filters

Filters are also similar to expressions.

```diff
- {
-   // ...
-   filter: [">", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }], 100],
- }
+ {
+   stages: [{
+     // ...
+     filters: [{
+       type: "operator",
+       operator: ">",
+       args: [
+        {
+          type: "column",
+          name: "TOTAL",
+          sourceName: "ORDERS",
+        },
+        { type: "literal", value: 100 }
+       ],
+     }],
+   }],
+ }
```

#### 3.h order-by

Order-bys are defined as a list of column specs with an optional direction.

```diff
- {
-   // ...
-   "order-by": [
-     ["asc", ["field", ORDERS.CREATED_AT, { "base-type": "type/DateTime" }]],
-     ["desc", ["field", ORDERS.TOTAL, { "base-type": "type/Float" }]],
-   ],
- }
+ {
+   stages: [{
+     // ...
+     orderBys: [
+       { type: "column", name: "CREATED_AT", sourceName: "ORDERS", direction: "asc" },
+       { type: "column", name: "TOTAL", sourceName: "ORDERS", direction: "desc" },
+     ],
+   }],
+ }
```

The `direction` defaults to `"asc"` if omitted.

#### 3.i fields

Fields (column selection) are defined as a list of column specs.

```diff
- {
-   // ...
-   fields: [
-     ["field", ORDERS.ID, { "base-type": "type/Integer" }],
-     ["field", ORDERS.TOTAL, { "base-type": "type/Float" }],
-   ],
- }
+ {
+   stages: [{
+     // ...
+     fields: [
+       { type: "column", name: "ID", sourceName: "ORDERS" },
+       { type: "column", name: "TOTAL", sourceName: "ORDERS" },
+     ],
+   }],
+ }
```

#### 3.j limit

Limit is a plain number.

```diff
- {
-   // ...
-   limit: 10,
- }
+ {
+   stages: [{
+     // ...
+     limit: 10,
+   }],
+ }
```

### 4. Native queries

Native queries need only minor rewriting:

- The `native: { query, "template-tags" }` wrapper is flattened — `query` and `templateTags` move to the top level of `dataset_query`.
- `template-tags` becomes camelCase `templateTags`.
- Boilerplate fields like `id` on individual tags can be dropped.
- The `dimension` field on a field-filter tag changes from a `LocalFieldReference` (`["field", id, opts]`) to a plain field ID (`number`).

#### Simple variable tag

```diff
-H.createQuestion({
-  name: "Test question",
-  query: {
-    type: "native",
-    database: SAMPLE_DB_ID,
-    native: {
-      query: "SELECT * FROM orders WHERE total > {{min_total}}",
-      "template-tags": {
-        min_total: {
-          id: "abc123",
-          name: "min_total",
-          "display-name": "Min Total",
-          type: "number",
-          default: 10,
-        },
-      },
-    },
-  },
-});
+H.createCardWithTestNativeQuery({
+  name: "Test question",
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    query: "SELECT * FROM orders WHERE total > {{min_total}}",
+    templateTags: {
+      min_total: {
+        type: "number",
+        name: "min_total",
+        "display-name": "Min Total",
+        default: 10,
+      },
+    },
+  },
+});
```

#### Field filter tag

The key difference from the legacy format is `dimension`: previously it held a full field reference like `["field", ORDERS.TOTAL, null]`; in the new spec it is just the field ID directly.

```diff
-H.createQuestion({
-  name: "Test question",
-  query: {
-    type: "native",
-    database: SAMPLE_DB_ID,
-    native: {
-      query: "SELECT * FROM orders [[WHERE {{total_filter}}]]",
-      "template-tags": {
-        total_filter: {
-          id: "abc123",
-          name: "total_filter",
-          "display-name": "Total filter",
-          type: "dimension",
-          dimension: ["field", ORDERS.TOTAL, null],
-          "widget-type": "number/=",
-        },
-      },
-    },
-  },
-});
+H.createCardWithTestNativeQuery({
+  name: "Test question",
+  dataset_query: {
+    database: SAMPLE_DB_ID,
+    query: "SELECT * FROM orders [[WHERE {{total_filter}}]]",
+    templateTags: {
+      total_filter: {
+        type: "dimension",
+        name: "total_filter",
+        "display-name": "Total filter",
+        dimension: ORDERS.TOTAL, // plain field ID, not a field reference
+        "widget-type": "number/=",
+      },
+    },
+  },
+});
```

### 5. Multi-stage queries

When the original query has multiple stages (i.e. a source query nested inside another query), represent them as additional stages in the `stages` array.

```diff
- {
-   type: "query",
-   database: SAMPLE_DB_ID,
-   query: {
-     "source-query": {
-       "source-table": ORDERS_ID,
-       aggregation: [["count"]],
-       breakout: [["field", ORDERS.CREATED_AT, { "temporal-unit": "month" }]],
-     },
-     filter: [">", ["field", "count", { "base-type": "type/Integer" }], 5],
-   },
- }
+ {
+   database: SAMPLE_DB_ID,
+   stages: [
+     {
+       source: { type: "table", id: ORDERS_ID },
+       aggregations: [{ type: "operator", operator: "count" }],
+       breakouts: [{ type: "column", name: "CREATED_AT", sourceName: "ORDERS", unit: "month" }],
+     },
+     {
+       filters: [{
+         type: "operator",
+         operator: ">",
+         args: [
+           { type: "column", name: "count" },
+           { type: "literal", value: 5 },
+         ],
+       }],
+     },
+   ],
+ }
```

Note that the second (and subsequent) stages do not have a `source` — the source is implicitly the previous stage.
