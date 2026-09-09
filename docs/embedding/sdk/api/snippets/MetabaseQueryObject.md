```ts
type MetabaseQueryObject =
  | {
  database?: unknown;
  parameters?: unknown;
  query?: unknown;
  type: "query";
}
  | {
  database?: unknown;
  native?: unknown;
  parameters?: unknown;
  type: "native";
}
  | {
  database?: unknown;
  lib/type: "mbql/query";
  parameters?: unknown;
  stages?: unknown;
};
```

Public structural type for ad-hoc SDK queries created by
`useMetabaseQueryObject`.
