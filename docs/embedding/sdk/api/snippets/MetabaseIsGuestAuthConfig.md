```ts
type MetabaseIsGuestAuthConfig = {
  metabaseInstanceUrl: string;
} & {
  apiKey?: never;
  fetchRequestToken?: never;
  isGuest: true;
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

| Name                   | Type    | Description                                      |
| :--------------------- | :------ | :----------------------------------------------- |
| `apiKey?`              | `never` | -                                                |
| `fetchRequestToken?`   | `never` | -                                                |
| `isGuest`              | `true`  | Defines if SDK should work in a Guest Embed mode |
| `preferredAuthMethod?` | `never` | -                                                |

<!-- [<endsnippet type-declaration>] -->
