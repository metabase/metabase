```ts
type SchemaRow<TSchema> = {
  [TColumn in TSchema["columns"][number] as TColumn["name"]]: SchemaValue<TColumn>;
};
```

## Type Parameters

<!-- [<snippet type-parameters>] -->

| Type Parameter                                                                           |
| :--------------------------------------------------------------------------------------- |
| `TSchema` _extends_ \{ `columns`: readonly [`SchemaColumn`](./api/SchemaColumn.md)[]; \} |

<!-- [<endsnippet type-parameters>] -->

## Not Exported

<!-- [<snippet not-exported>] -->

SchemaValue

<!-- [<endsnippet not-exported>] -->
