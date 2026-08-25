```ts
type ParameterChangeSource = "initial-state" | "manual-change" | "auto-change";
```

Source of a parameter-change event:

- `initial-state` - first applied snapshot, fired once per dashboard load.
- `manual-change` - user edited parameters in UI.
- `auto-change` - in the case of auto-updates, e.g. to pass normalized values back to parent.
