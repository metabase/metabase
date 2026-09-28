```ts
type MetabaseAuthConfigWithProvider = {
  fetchRequestToken: MetabaseFetchRequestTokenFn;
  metabaseInstanceUrl: string;
} & {
  apiKey: never;
  authProviderUri: string;
};
```

## Type declaration

<!-- [<snippet type-declaration>] -->

| Name                  | Type                                                                  | Description                                                                                                               |
| :-------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| `fetchRequestToken?`  | [`MetabaseFetchRequestTokenFn`](./api/MetabaseFetchRequestTokenFn.md) | Specifies a function to fetch the refresh token. The refresh token should be in the format of { id: string, exp: number } |
| `metabaseInstanceUrl` | `string`                                                              | -                                                                                                                         |

<!-- [<endsnippet type-declaration>] -->

## Type declaration

<!-- [<snippet type-declaration>] -->

| Name              | Type     |
| :---------------- | :------- |
| `apiKey?`         | `never`  |
| `authProviderUri` | `string` |

<!-- [<endsnippet type-declaration>] -->
