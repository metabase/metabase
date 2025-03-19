```ts
type ColumnExtractDrillThruInfo = BaseDrillThruInfo<"drill-thru/column-extract"> & {
  displayName: string;
  extractions: ColumnExtractionInfo[];
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| `displayName` | `string` |
| `extractions` | [`ColumnExtractionInfo`](ColumnExtractionInfo.md)[] |
