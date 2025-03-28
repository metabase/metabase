```ts
type CollectionEssentials = Pick<Collection, "id" | "name" | "authority_level" | "type"> & Partial<Pick<Collection, "effective_ancestors">>;
```
