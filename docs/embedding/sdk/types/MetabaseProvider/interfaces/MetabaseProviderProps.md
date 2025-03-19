## Extended by

- [`InternalMetabaseProviderProps`](../internal-types/interfaces/InternalMetabaseProviderProps.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="allowconsolelog"></a> `allowConsoleLog?` | `boolean` | Whether to allow logging to the DevTools console. Defaults to true. |
| <a id="authconfig"></a> `authConfig` | [`MetabaseAuthConfig`](../internal-types/type-aliases/MetabaseAuthConfig.md) | - |
| <a id="children"></a> `children` | `ReactNode` | - |
| <a id="classname"></a> `className?` | `string` | - |
| <a id="errorcomponent"></a> `errorComponent?` | [`SdkErrorComponent`](../internal-types/type-aliases/SdkErrorComponent.md) | A custom error component to display when the SDK encounters an error. |
| <a id="eventhandlers"></a> `eventHandlers?` | [`SdkEventHandlersConfig`](../internal-types/type-aliases/SdkEventHandlersConfig.md) | - |
| <a id="loadercomponent"></a> `loaderComponent?` | () => `Element` | A custom loader component to display while the SDK is loading. |
| <a id="locale"></a> `locale?` | `string` | Defines the display language. Accepts an ISO language code such as `en` or `de`. Defaults to `en`. Does not support country code suffixes (i.e. `en-US`) |
| <a id="pluginsconfig"></a> `pluginsConfig?` | [`MetabasePluginsConfig`](../internal-types/type-aliases/MetabasePluginsConfig.md) | - |
| <a id="theme"></a> `theme?` | [`MetabaseTheme`](../internal-types/interfaces/MetabaseTheme.md) | - |
