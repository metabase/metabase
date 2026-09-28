```ts
function useMetabaseAuthStatus(): null | LoginStatus;
```

Returns the authentication status of the current user in the Metabase embedding SDK.
Returns `null` until the SDK is fully loaded and initialized.

## Returns

<!-- [<snippet returns>] -->

`null` \| [`LoginStatus`](./api/LoginStatus.md)

<!-- [<endsnippet returns>] -->
