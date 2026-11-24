```ts
type SchemaColumn = {
  description?: string;
  displayName?: string;
  jsType?: SchemaJavaScriptType;
  name: string;
  type?: "column";
};
```

## Properties

<!-- [<snippet properties>] -->

| Property                                             | Type                                                                             |
| :--------------------------------------------------- | :------------------------------------------------------------------------------- |
| <a id="schemacolumn-description"></a> `description?` | `string`                                                                         |
| <a id="schemacolumn-displayname"></a> `displayName?` | `string`                                                                         |
| <a id="schemacolumn-jstype"></a> `jsType?`           | [`SchemaJavaScriptType`](/docs/latest/embedding/sdk/api/SchemaJavaScriptType.md) |
| <a id="schemacolumn-name"></a> `name`                | `string`                                                                         |
| <a id="schemacolumn-type"></a> `type?`               | `"column"`                                                                       |

<!-- [<endsnippet properties>] -->
