```ts
type MetabaseAuthConfigWithApiKey = {
  metabaseInstanceUrl: string;
} & {
  apiKey: string;
  fetchRequestToken?: never;
  isGuest?: false;
  preferredAuthMethod?: never;
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

| Name                   | Type     |
| :--------------------- | :------- |
| `apiKey`               | `string` |
| `fetchRequestToken?`   | `never`  |
| `isGuest?`             | `false`  |
| `preferredAuthMethod?` | `never`  |

<!-- [<endsnippet type-declaration>] -->
