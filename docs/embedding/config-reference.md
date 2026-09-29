---
title: Config reference
summary: "Reference for the page-level config settings for web components, and the props you can pass to the React SDK's MetabaseProvider."
---

# Config reference

Reference material for the config that every modular embed on a page shares: the `defineMetabaseConfig()` settings for web components, and the `MetabaseProvider` props for the React SDK.

For how to set all this up, check out [Configure your embeds](./config.md).

## Web component `defineMetabaseConfig()` settings

Every web component on the page uses these settings. For the SDK, see [`MetabaseProvider` props](#react-sdk-metabaseprovider-props).

| Setting                       | Type     | What it does                                                                                                                                                                                                                      |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `instanceUrl`                 | string   | The URL of your Metabase, like `https://youlooknicetoday.metabaseapp.com`. Required.                                                                                                                                              |
| `isGuest`                     | boolean  | Whether the components authenticate as guest embeds, with a signed JWT instead of a Metabase session. See [Configure a guest embed](./config.md#configure-a-guest-embed).                                                         |
| `guestEmbedProviderUri`       | string   | Guest embeds only. Your app's endpoint that signs guest tokens. On load, the embed calls this endpoint for a token, and again when the current token expires. See [Configure a guest embed](./config.md#configure-a-guest-embed). |
| `locale`                      | string   | The display language for every embed, as an ISO language code. Defaults to your Metabase instance's locale. See [Set the language](./config.md#set-the-language).                                                                 |
| `theme`                       | object   | Colors, fonts, and per-component appearance overrides. See [Appearance](./appearance.md).                                                                                                                                         |
| `pluginsConfig`               | object   | Plugins that customize component behavior. Web components support `handleLink`, for customizing what happens when people click a link. See [Web component plugins](./config.md#web-component-plugins).                            |
| `allowedCustomVisualizations` | string[] | The custom visualizations that components on the page can load, each prefixed with `custom:`. Not available in guest embeds. See [custom visualizations in embeds](./custom-visualizations.md).                                   |
| `fetchRequestToken`           | function | SSO embeds with JWT only. A function that fetches the JWT for embeds. Returns `Promise<{ jwt: string }>`. See [customizing JWT authentication](./authentication.md#customizing-jwt-authentication).                               |
| `useExistingUserSession`      | boolean  | Whether to render embeds with your Metabase session. Development only. Only supported in Google Chrome.                                                                                                                           |
| `apiKey`                      | string   | An API key from your Metabase. Embeds use it to render on localhost. Development only. See [Preview embeds during development](./config.md#preview-embeds-during-development).                                                    |

## React SDK `MetabaseProvider` props

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

`MetabaseProvider` provides the [configuration](./config.md#configure-the-react-sdk) that every Metabase component inside it uses.

- [Component](./sdk/api/MetabaseProvider.html)
- [Props](./sdk/api/MetabaseProviderProps.html)

{% include_file "{{ dirname }}/sdk/api/snippets/MetabaseProviderProps.md" snippet="properties" %}

## React SDK `eventHandlers`

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

The `eventHandlers` prop on `MetabaseProvider` maps event types to handler functions. See [Handle embed events](./config.md#handle-embed-events-react-sdk-only).

- [Type](./sdk/api/SdkEventHandlersConfig.html)

{% include_file "{{ dirname }}/sdk/api/snippets/SdkEventHandlersConfig.md" snippet="properties" %}

## Further reading

- [Configure your embeds](./config.md)
- [Appearance](./appearance.md)
- [Authentication](./authentication.md)
- [Guest embedding](./guest-embedding.md)
- [Modular embedding components](./components.md)
