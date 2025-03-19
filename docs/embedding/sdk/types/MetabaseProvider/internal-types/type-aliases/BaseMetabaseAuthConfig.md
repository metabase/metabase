```ts
type BaseMetabaseAuthConfig = {
  fetchRequestToken: MetabaseFetchRequestTokenFn;
  metabaseInstanceUrl: string;
};
```

## Type declaration

| Name | Type | Description |
| ------ | ------ | ------ |
| <a id="fetchrequesttoken"></a> `fetchRequestToken`? | [`MetabaseFetchRequestTokenFn`](MetabaseFetchRequestTokenFn.md) | Specifies a function to fetch the refresh token. The refresh token should be in the format of { id: string, exp: number } |
| <a id="metabaseinstanceurl"></a> `metabaseInstanceUrl` | `string` | - |
