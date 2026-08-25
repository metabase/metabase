```ts
type SqlParameterChangeSource =
  | "initial-state"
  | "manual-change"
  | "auto-change";
```

Source of a sql-parameter-change event:

- `initial-state` - first applied state, fired once per question load.
- `manual-change` - user edited parameters in UI.
- `auto-change` - in the case of auto-updates, e.g. to pass normalized values back to parent.
