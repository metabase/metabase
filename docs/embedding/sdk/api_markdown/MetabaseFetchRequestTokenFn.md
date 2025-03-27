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
\| [`MetabaseEmbeddingSessionToken`](./api_html/MetabaseEmbeddingSessionToken.md)
\| `null`>
