```ts
type ActionResultForDelete = {
  rows-deleted: readonly (null | string | number | false | true | object)[];
};
```

Response from a single-row delete — the affected primary keys.

## Properties

<!-- [<snippet properties>] -->

| Property                                 | Type                                                                         |
| :--------------------------------------- | :--------------------------------------------------------------------------- |
| <a id="rows-deleted"></a> `rows-deleted` | readonly (`null` \| `string` \| `number` \| `false` \| `true` \| `object`)[] |

<!-- [<endsnippet properties>] -->
