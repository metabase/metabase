```ts
type ColumnRangeFormattingSetting = {
  colors: string[];
  columns: string[];
  max_type: "custom" | "all" | null;
  max_value: number;
  min_type: "custom" | "all" | null;
  min_value: number;
  type: "range";
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="colors"></a> `colors` | `string`[] |
| <a id="columns"></a> `columns` | `string`[] |
| <a id="max_type"></a> `max_type` | `"custom"` \| `"all"` \| `null` |
| <a id="max_value"></a> `max_value`? | `number` |
| <a id="min_type"></a> `min_type` | `"custom"` \| `"all"` \| `null` |
| <a id="min_value"></a> `min_value`? | `number` |
| <a id="type"></a> `type` | `"range"` |
