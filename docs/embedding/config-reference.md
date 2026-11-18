---
title: Config reference
summary: "Reference for the page-level config settings for web components, and the props you can pass to the React SDK's MetabaseProvider."
---

# Config reference

Reference material for the config that every modular embed on a page shares: the `defineMetabaseConfig()` settings for web components, and the `MetabaseProvider` props for the React SDK.

For how to set all this up, check out [Configure your embeds](./config.md).

## Web component `defineMetabaseConfig()` settings

Every web component on the page uses these settings. For the SDK, see [`MetabaseProvider` props](#react-sdk-metabaseprovider-props).

{% include_file "{{ dirname }}/eajs/snippets/MetabaseConfig.md" snippet="properties" %}

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
