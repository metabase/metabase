```ts
type WritebackAction = WritebackActionBase &
  | QueryAction
  | ImplicitQueryAction
  | HttpAction;
```
