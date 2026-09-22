```ts
type MetabaseAuthConfigWithApiKey = {
  fetchRequestToken: MetabaseFetchRequestTokenFn;
  metabaseInstanceUrl: string;
} & {
  apiKey: string;
  authProviderUri: never;
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

| Name               | Type     |
| :----------------- | :------- |
| `apiKey`           | `string` |
| `authProviderUri?` | `never`  |

<!-- [<endsnippet type-declaration>] -->
