```ts
type IndexedEntity = {
  id: number;
  model: "indexed-entity";
  model_id: CardId;
  model_name: string;
  name: string;
  pk_ref: FieldReference;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="id"></a> `id` | `number` |
| <a id="model"></a> `model` | `"indexed-entity"` |
| <a id="model_id"></a> `model_id` | [`CardId`](CardId.md) |
| <a id="model_name"></a> `model_name` | `string` |
| <a id="name"></a> `name` | `string` |
| <a id="pk_ref"></a> `pk_ref` | [`FieldReference`](FieldReference.md) |
