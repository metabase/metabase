```ts
type AnyActionResult =
  | ActionResultForCreate
  | ActionResultForUpdate
  | ActionResultForDelete
  | ActionResultForBulk
  | ActionResultForSql;
```

Union of every possible response body. Used as the `result` default when
`TKind` is omitted, so authors who don't know the action's kind upfront
still get TS-narrowable shapes (via `"<key>" in result`) instead of a
permissive `Record<string, unknown>` that swallows mistyped reads.
