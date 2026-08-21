```ts
type ActionResultForCreate = {
  created-row: Record<string, null | string | number | false | true | object>;
};
```

Response from a single-row create — the inserted row.

## Properties

<!-- [<snippet properties>] -->

| Property                               | Type                                                                                                                                                                     |
| :------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="created-row"></a> `created-row` | [`Record`](https://www.typescriptlang.org/docs/handbook/utility-types.html#recordkeys-type)\<`string`, `null` \| `string` \| `number` \| `false` \| `true` \| `object`\> |

<!-- [<endsnippet properties>] -->
