```ts
type RequestsGroupState = Record<
  EntityKey,
  Record<QueryKey, Record<RequestType, RequestState>>
>;
```
