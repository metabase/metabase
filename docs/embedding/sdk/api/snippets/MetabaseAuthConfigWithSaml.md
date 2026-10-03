```ts
type MetabaseAuthConfigWithSaml = {
  metabaseInstanceUrl: string;
} & {
  apiKey?: never;
  fetchRequestToken?: never;
  isGuest?: false;
  preferredAuthMethod?: "saml";
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

| Name                   | Type     | Description                                                                                                                                             |
| :--------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiKey?`              | `never`  | -                                                                                                                                                       |
| `fetchRequestToken?`   | `never`  | -                                                                                                                                                       |
| `isGuest?`             | `false`  | -                                                                                                                                                       |
| `preferredAuthMethod?` | `"saml"` | Which authentication method to use. If both SAML and JWT are enabled at the same time, it defaults to SAML unless the preferredAuthMethod is specified. |

<!-- [<endsnippet type-declaration>] -->
