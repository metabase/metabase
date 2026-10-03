```ts
type FieldSchema = SchemaColumn & {
  fieldId?: number;
  id?: string | number;
  sourceFieldId?: number;
  sourceName?: string;
  tableId?: number;
  type: "column";
};
```

Metadata for a generated table field.

## Type Declaration

<!-- [<snippet type-declaration>] -->

| Name             | Type                 |
| :--------------- | :------------------- |
| `fieldId?`       | `number`             |
| `id?`            | `string` \| `number` |
| `sourceFieldId?` | `number`             |
| `sourceName?`    | `string`             |
| `tableId?`       | `number`             |
| `type`           | `"column"`           |

<!-- [<endsnippet type-declaration>] -->
