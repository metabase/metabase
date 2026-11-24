```ts
type MetabaseAuthConfigWithJwt = {
  metabaseInstanceUrl: string;
} & {
  apiKey?: never;
  fetchRequestToken?: MetabaseFetchRequestTokenFn;
  isGuest?: false;
  jwtProviderUri?: string;
  preferredAuthMethod?: "jwt";
};
```

## Type Declaration

<!-- [<snippet type-declaration>] -->

| Name                  | Type     |
| :-------------------- | :------- |
| `metabaseInstanceUrl` | `string` |

<!-- [<endsnippet type-declaration>] -->

## Type Declaration

<!-- [<snippet type-declaration>] -->

| Name                   | Type                                                                                           | Description                                                                                                                                                                      |
| :--------------------- | :--------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey?`              | `never`                                                                                        | -                                                                                                                                                                                |
| `fetchRequestToken?`   | [`MetabaseFetchRequestTokenFn`](/docs/latest/embedding/sdk/api/MetabaseFetchRequestTokenFn.md) | Specifies a function to fetch the refresh token. The refresh token should be in the format of [UserBackendJwtResponse](/docs/latest/embedding/sdk/api/UserBackendJwtResponse.md) |
| `isGuest?`             | `false`                                                                                        | -                                                                                                                                                                                |
| `jwtProviderUri?`      | `string`                                                                                       | Uri of the jwt provider. If provided the sdk will use jwt and will skip the first `/auth/sso` discovery request.                                                                 |
| `preferredAuthMethod?` | `"jwt"`                                                                                        | Which authentication method to use. If both SAML and JWT are enabled at the same time, it defaults to SAML unless the preferredAuthMethod is specified.                          |

<!-- [<endsnippet type-declaration>] -->
