---
title: Modular embedding SDK - config
summary: Configure the Metabase modular embedding SDK with MetabaseProvider, set up authentication, handle global events, and reload embedded components.
---

# Modular embedding SDK - config

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

## Passing a configuration object to `MetabaseProvider`

To use the SDK in your app, you need to import the `MetabaseProvider` component and provide it with an `authConfig` object.

### `MetabaseProvider`

A component that configures the SDK and provides the Metabase SDK's context and theme.

To pass a theme, use `defineMetabaseTheme`. See [Reuse a saved theme in the SDK](../appearance.md#reuse-a-saved-theme-in-the-sdk).

#### API Reference

- [Component](./api/MetabaseProvider.html)
- [Props](./api/MetabaseProviderProps.html)

#### Example

```typescript
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" %}
```

#### Props

{% include_file "{{ dirname }}/api/snippets/MetabaseProviderProps.md" snippet="properties" %}

## Custom visualizations

The SDK can render [custom visualizations](../../questions/visualizations/custom.md). To allow custom visualizations in the embed, pass an allowlist of the custom visualizations to the `allowedCustomVisualizations` prop on `MetabaseProvider`:

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-custom-visualizations.tsx" snippet="example" %}
```

Only the custom visualizations you list will load. Each entry is the visualization's name (the manifest `name`, which you can find under **Admin** > **Settings** > **Custom visualizations** > **Manage visualizations**), prefixed with `custom:`. For example, a custom visualization named `Calendar Heatmap` becomes `"custom:Calendar Heatmap"`. Names are case-sensitive, so `"custom:calendar heatmap"` won't match a visualization named `Calendar Heatmap`.

Omitting the prop, or passing an empty array, turns off custom visualizations. Cards that use a custom visualization will fall back to the default visualization for the query's results. If you allowlist a name that doesn't match an installed custom visualization, the SDK logs a warning to the console and falls back to the default visualization.


For security, the SDK runs each custom visualization's code in an isolated sandbox, so a visualization can't reach your app or make network requests. The sandbox doesn't block passive image loads, though. A visualization can still trigger outbound requests through `<img>` tags or CSS `url()`. To limit where custom visualizations can load images from, set a Content Security Policy with an `img-src` allowlist in your app (the core Metabase app does this with [Restrict image domains](../../configuring-metabase/settings.md#restrict-image-domains)). [Only add visualizations you trust](../../questions/visualizations/custom.md#only-add-visualizations-you-trust).

## Global event handlers

You can listen for events by defining the `eventHandlers` prop for `MetabaseProvider`.

### `SdkEventHandlersConfig`

Accepts an object where each key is an event type and the corresponding value is the event handler function.

#### API Reference

- [Type](./api/SdkEventHandlersConfig.html)

#### Example

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-event-handlers.tsx" snippet="example" %}
```

#### Props

{% include_file "{{ dirname }}/api/snippets/SdkEventHandlersConfig.md" snippet="properties" %}

## Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to show the latest data, you can do so by using the `key` prop to force a component to reload.

```typescript
{% include_file "{{ dirname }}/snippets/config/reload-metabase-provider.tsx" snippet="example" %}
```
