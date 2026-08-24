```ts
type MetabaseIsGuestAuthConfig = {
  metabaseInstanceUrl: string;
} & {
  apiKey?: never;
  fetchRequestToken?: never;
  guestEmbedProviderUri?: string;
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

| Name                     | Type     | Description                                                                                                                                                                                                                                                                                                                                                                          |
| :----------------------- | :------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apiKey?`                | `never`  | -                                                                                                                                                                                                                                                                                                                                                                                    |
| `fetchRequestToken?`     | `never`  | -                                                                                                                                                                                                                                                                                                                                                                                    |
| `guestEmbedProviderUri?` | `string` | URL endpoint for fetching and refreshing guest embed JWT tokens (iframe only, not applicable for SDK's guest mode). Supports both token refresh on expiry and initial token fetch when no static token is provided. In both cases, this works with guest embed components (metabase-dashboard and metabase-question). The endpoint should return { jwt: string } with the new token. |
| `isGuest`                | `true`   | Defines if SDK should work in a Guest Embed mode                                                                                                                                                                                                                                                                                                                                     |
| `preferredAuthMethod?`   | `never`  | -                                                                                                                                                                                                                                                                                                                                                                                    |

<!-- [<endsnippet type-declaration>] -->
