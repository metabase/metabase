```ts
type TableDisplayInfo = {
  displayName: string;
  isFromJoin: boolean;
  isImplicitlyJoinable: boolean;
  isMetric: boolean;
  isModel: boolean;
  isQuestion: boolean;
  isSourceTable: boolean;
  name: string;
  schema: SchemaId;
  visibilityType: TableVisibilityType;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="displayname"></a> `displayName` | `string` |
| <a id="isfromjoin"></a> `isFromJoin` | `boolean` |
| <a id="isimplicitlyjoinable"></a> `isImplicitlyJoinable` | `boolean` |
| <a id="ismetric"></a> `isMetric`? | `boolean` |
| <a id="ismodel"></a> `isModel`? | `boolean` |
| <a id="isquestion"></a> `isQuestion`? | `boolean` |
| <a id="issourcetable"></a> `isSourceTable` | `boolean` |
| <a id="name"></a> `name` | `string` |
| <a id="schema"></a> `schema` | [`SchemaId`](SchemaId.md) |
| <a id="visibilitytype"></a> `visibilityType`? | [`TableVisibilityType`](../../../../MetabaseProvider/internal-types/type-aliases/TableVisibilityType.md) |
