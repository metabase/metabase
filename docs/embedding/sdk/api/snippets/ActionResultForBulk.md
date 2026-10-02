```ts
type ActionResultForBulk = {
  rows-created?: number;
  rows-deleted?: number;
  rows-updated?: number;
  success: boolean;
};
```

Response from any bulk variant — a success flag plus optional counts.

## Properties

<!-- [<snippet properties>] -->

| Property                                  | Type      |
| :---------------------------------------- | :-------- |
| <a id="rows-created"></a> `rows-created?` | `number`  |
| <a id="rows-deleted"></a> `rows-deleted?` | `number`  |
| <a id="rows-updated"></a> `rows-updated?` | `number`  |
| <a id="success"></a> `success`            | `boolean` |

<!-- [<endsnippet properties>] -->
