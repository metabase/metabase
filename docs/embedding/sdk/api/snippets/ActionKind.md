```ts
type ActionKind = "create" | "update" | "delete" | "bulk" | "sql";
```

Flat public kind union. Maps onto the backend's namespaced
`row/*` + `bulk/*` `implicitKind` and the `query` `type` value, but
exposes a simpler five-value surface to callers: `create` / `update` /
`delete` always refer to a single row, `bulk` covers any bulk variant,
and `sql` covers custom SQL actions (the backend's `query`-type action).
