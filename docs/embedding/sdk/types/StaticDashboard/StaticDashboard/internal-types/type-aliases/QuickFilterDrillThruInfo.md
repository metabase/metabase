```ts
type QuickFilterDrillThruInfo = BaseDrillThruInfo<"drill-thru/quick-filter"> & {
  operators: QuickFilterDrillThruOperator[];
  value: unknown;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `operators` | [`QuickFilterDrillThruOperator`](QuickFilterDrillThruOperator.md)[] |
| `value` | `unknown` |
