```ts
type ActionKind = "create" | "update" | "delete" | "sql";
```

Flat public kind union. Maps onto the backend's namespaced `row/*`
`implicitKind` and the `query` `type` value, but exposes a simpler
four-value surface to callers: `create` / `update` / `delete` always refer
to a single row, and `sql` covers custom SQL actions (the backend's
`query`-type action).
