```ts
type EmbeddingSessionTokenState = {
  error: SerializedError | null;
  loading: boolean;
  token:   | MetabaseEmbeddingSessionToken
     | null;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="error"></a> `error` | `SerializedError` \| `null` |
| <a id="loading"></a> `loading` | `boolean` |
| <a id="token"></a> `token` | \| [`MetabaseEmbeddingSessionToken`](MetabaseEmbeddingSessionToken.md) \| `null` |
