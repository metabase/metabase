#### Extends

* `Omit`<[`CommonElementProps`](internal/CommonElementProps.md), `"style"`>

#### Properties

| Property                                        | Type                                                           | Description                                                                                                                                              | Inherited from   |
| ----------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| <a id="allowconsolelog"></a> `allowConsoleLog?` | `boolean`                                                      | Whether to allow logging to the DevTools console. Defaults to true.                                                                                      | -                |
| <a id="authconfig"></a> `authConfig`            | [`MetabaseAuthConfig`](MetabaseAuthConfig.md)                  | Defines how to authenticate with Metabase.                                                                                                               | -                |
| <a id="children"></a> `children`                | `ReactNode`                                                    | The children of the MetabaseProvider component.                                                                                                          | -                |
| <a id="classname"></a> `className?`             | `string`                                                       | A custom class name to be added to the root element.                                                                                                     | `Omit.className` |
| <a id="errorcomponent"></a> `errorComponent?`   | [`SdkErrorComponent`](internal/SdkErrorComponent.md)           | A custom error component to display when the SDK encounters an error.                                                                                    | -                |
| <a id="eventhandlers"></a> `eventHandlers?`     | [`SdkEventHandlersConfig`](internal/SdkEventHandlersConfig.md) | See [Global event handlers](#global-event-handlers).                                                                                                     | -                |
| <a id="loadercomponent"></a> `loaderComponent?` | () => `Element`                                                | A custom loader component to display while the SDK is loading.                                                                                           | -                |
| <a id="locale"></a> `locale?`                   | `string`                                                       | Defines the display language. Accepts an ISO language code such as `en` or `de`. Defaults to `en`. Does not support country code suffixes (i.e. `en-US`) | -                |
| <a id="pluginsconfig"></a> `pluginsConfig?`     | [`MetabasePluginsConfig`](MetabasePluginsConfig.md)            | See [Plugins](./plugins.md).                                                                                                                             | -                |
| <a id="theme"></a> `theme?`                     | [`MetabaseTheme`](MetabaseTheme.md)                            | See [Appearance](./appearance.md).                                                                                                                       | -                |
