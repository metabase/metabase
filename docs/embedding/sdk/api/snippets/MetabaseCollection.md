```ts
type MetabaseCollection = {
  description: string | null;
  entity_id?: SdkEntityId;
  id: SdkCollectionId;
  name: string;
  slug?: string;
};
```

The Collection entity

## Properties

<!-- [<snippet properties>] -->

| Property                               | Type                                          |
| :------------------------------------- | :-------------------------------------------- |
| <a id="description"></a> `description` | `string` \| `null`                            |
| <a id="entity_id"></a> `entity_id?`    | [`SdkEntityId`](./api/SdkEntityId.md)         |
| <a id="id"></a> `id`                   | [`SdkCollectionId`](./api/SdkCollectionId.md) |
| <a id="name"></a> `name`               | `string`                                      |
| <a id="slug"></a> `slug?`              | `string`                                      |

<!-- [<endsnippet properties>] -->
