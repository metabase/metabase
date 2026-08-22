```ts
function useMetabaseAuthStatus(): null | InitializationStatus;
```

Returns the authentication status of the current user in the Metabase embedding SDK.
Returns `null` until the SDK is fully loaded and initialized.

## Returns

<!-- [<snippet returns>] -->

`null` \| [`InitializationStatus`](./api/InitializationStatus.md)

<!-- [<endsnippet returns>] -->
