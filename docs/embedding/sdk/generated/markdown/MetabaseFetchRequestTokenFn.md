```ts
type MetabaseFetchRequestTokenFn = (url: string) => Promise<
  | MetabaseEmbeddingSessionToken
| null>;
```

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `url`     | `string` |

#### Returns

`Promise`<
\| [`MetabaseEmbeddingSessionToken`](./generated/html/MetabaseEmbeddingSessionToken.md)
\| `null`>
