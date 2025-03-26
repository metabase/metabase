```ts
type BinnedField = ["field", FieldId | string, Omit<ReferenceOptions, "temporal-unit"> & {
  binning: BinningOptions;
 }];
```
