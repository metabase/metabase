```ts
type MetabaseAuthConfigWithJwt = {
  metabaseInstanceUrl: string;
} & {
  apiKey?: never;
  fetchRequestToken?: MetabaseFetchRequestTokenFn;
  preferredAuthMethod?: "jwt";
};
```

## Type declaration

<!-- [<snippet type-declaration>] -->

| Name                  | Type     |
| :-------------------- | :------- |
| `metabaseInstanceUrl` | `string` |

<!-- [<endsnippet type-declaration>] -->

## Type declaration

<!-- [<snippet type-declaration>] -->

| Name                   | Type                                                                  | Description                                                                                                                                             |
| :--------------------- | :-------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiKey?`              | `never`                                                               | -                                                                                                                                                       |
| `fetchRequestToken?`   | [`MetabaseFetchRequestTokenFn`](./api/MetabaseFetchRequestTokenFn.md) | Specifies a function to fetch the refresh token. The refresh token should be in the format of [UserBackendJwtResponse](./api/UserBackendJwtResponse.md) |
| `preferredAuthMethod?` | `"jwt"`                                                               | Which authentication method to use. If both SAML and JWT are enabled at the same time, it defaults to SAML unless the preferredAuthMethod is specified. |

<!-- [<endsnippet type-declaration>] -->
