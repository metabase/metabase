```ts
type ColumnSingleFormattingSetting = {
  color: string;
  columns: string[];
  highlight_row: boolean;
  operator: ColumnFormattingOperator;
  type: "single";
  value: string | number;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="color"></a> `color` | `string` |
| <a id="columns"></a> `columns` | `string`[] |
| <a id="highlight_row"></a> `highlight_row` | `boolean` |
| <a id="operator"></a> `operator` | [`ColumnFormattingOperator`](ColumnFormattingOperator.md) |
| <a id="type"></a> `type` | `"single"` |
| <a id="value"></a> `value` | `string` \| `number` |
