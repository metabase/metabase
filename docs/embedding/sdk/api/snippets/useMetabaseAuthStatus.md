```ts
function useMetabaseAuthStatus(): InitializationStatus | null;
```

Returns the authentication status of the current user in the Metabase embedding SDK.
Returns `null` until the SDK is fully loaded and initialized.

## Returns

<!-- [<snippet returns>] -->

[`InitializationStatus`](./api/InitializationStatus.md) \| `null`

<!-- [<endsnippet returns>] -->
