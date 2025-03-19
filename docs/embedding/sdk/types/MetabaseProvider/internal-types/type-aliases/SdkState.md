```ts
type SdkState = {
  errorComponent: null | SdkErrorComponent;
  eventHandlers: null | SdkEventHandlersConfig;
  fetchRefreshTokenFn: null | MetabaseFetchRequestTokenFn;
  loaderComponent: null | () => JSX.Element;
  loginStatus: LoginStatus;
  metabaseInstanceUrl: MetabaseAuthConfig["metabaseInstanceUrl"];
  plugins: null | MetabasePluginsConfig;
  token: EmbeddingSessionTokenState;
  usageProblem: null | SdkUsageProblem;
};
```

## Type declaration

| Name | Type |
| ------ | ------ |
| <a id="errorcomponent"></a> `errorComponent` | `null` \| [`SdkErrorComponent`](SdkErrorComponent.md) |
| <a id="eventhandlers"></a> `eventHandlers` | `null` \| [`SdkEventHandlersConfig`](SdkEventHandlersConfig.md) |
| <a id="fetchrefreshtokenfn"></a> `fetchRefreshTokenFn` | `null` \| [`MetabaseFetchRequestTokenFn`](MetabaseFetchRequestTokenFn.md) |
| <a id="loadercomponent"></a> `loaderComponent` | `null` \| () => `JSX.Element` |
| <a id="loginstatus"></a> `loginStatus` | [`LoginStatus`](LoginStatus.md) |
| <a id="metabaseinstanceurl"></a> `metabaseInstanceUrl` | [`MetabaseAuthConfig`](MetabaseAuthConfig.md)\[`"metabaseInstanceUrl"`\] |
| <a id="plugins"></a> `plugins` | `null` \| [`MetabasePluginsConfig`](MetabasePluginsConfig.md) |
| <a id="token"></a> `token` | [`EmbeddingSessionTokenState`](EmbeddingSessionTokenState.md) |
| <a id="usageproblem"></a> `usageProblem` | `null` \| [`SdkUsageProblem`](../interfaces/SdkUsageProblem.md) |
