**`Expand`**

## Extends

<!-- [<snippet extends>] -->

- [`Omit`](https://www.typescriptlang.org/docs/handbook/utility-types.html#omittype-keys)\<\{
  `className`: `string`;
  `style`: [`CSSProperties`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L2579);
  \}, `"style"`\>

<!-- [<endsnippet extends>] -->

## Properties

<!-- [<snippet properties>] -->

| Property                                        | Type                                                                                                                                             | Description                                                                                                       |
| :---------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------- |
| <a id="allowconsolelog"></a> `allowConsoleLog?` | `boolean`                                                                                                                                        | Whether to allow logging to the DevTools console. Defaults to true.                                               |
| <a id="authconfig"></a> `authConfig`            | [`MetabaseAuthConfig`](./api/MetabaseAuthConfig.md)                                                                                              | Defines how to authenticate with Metabase.                                                                        |
| <a id="children"></a> `children`                | [`ReactNode`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L478)      | The children of the MetabaseProvider component.                                                                   |
| <a id="classname"></a> `className?`             | `string`                                                                                                                                         | A custom class name to be added to the root element.                                                              |
| <a id="errorcomponent"></a> `errorComponent?`   | [`SdkErrorComponent`](./api/SdkErrorComponent.md)                                                                                                | A custom error component to display when the SDK encounters an error.                                             |
| <a id="eventhandlers"></a> `eventHandlers?`     | [`SdkEventHandlersConfig`](./api/SdkEventHandlersConfig.md)                                                                                      | See [Global event handlers](https://www.metabase.com/docs/latest/embedding/sdk/config#global-event-handlers).     |
| <a id="loadercomponent"></a> `loaderComponent?` | () => [`Element`](https://github.com/DefinitelyTyped/DefinitelyTyped/blob/0b728411cd1dfb4bd26992bb35a73cf8edaa22e7/types/react/index.d.ts#L4240) | A custom loader component to display while the SDK is loading.                                                    |
| <a id="locale"></a> `locale?`                   | `string`                                                                                                                                         | Defines the display language. Accepts an ISO language code such as `en` or `de`. Defaults to the instance locale. |
| <a id="pluginsconfig"></a> `pluginsConfig?`     | [`MetabasePluginsConfig`](./api/MetabasePluginsConfig.md)                                                                                        | See [Plugins](https://www.metabase.com/docs/latest/embedding/sdk/plugins).                                        |
| <a id="theme"></a> `theme?`                     | [`MetabaseTheme`](./api/MetabaseTheme.md)                                                                                                        | See [Appearance](https://www.metabase.com/docs/latest/embedding/sdk/appearance).                                  |

<!-- [<endsnippet properties>] -->
