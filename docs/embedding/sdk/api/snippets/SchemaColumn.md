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

| Property                                | Type                                                                             |
| :-------------------------------------- | :------------------------------------------------------------------------------- |
| <a id="description"></a> `description?` | `string`                                                                         |
| <a id="displayname"></a> `displayName?` | `string`                                                                         |
| <a id="jstype"></a> `jsType?`           | [`SchemaJavaScriptType`](/docs/latest/embedding/sdk/api/SchemaJavaScriptType.md) |
| <a id="name"></a> `name`                | `string`                                                                         |
| <a id="type"></a> `type?`               | `"column"`                                                                       |

<!-- [<endsnippet properties>] -->
