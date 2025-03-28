```ts
type DatetimeField = ["field", FieldId | string, Omit<ReferenceOptions, "binning"> & {
  temporal-unit: DatetimeUnit;
 }];
```
