---
title: Embedded analytics SDK - config
---

# Embedded analytics SDK - config

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

To use the SDK in your app, you need to import the `MetabaseProvider` component and provide it with an `authConfig` object, like so:

```typescript
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" snippet="example" %}
```

You can also pass additional props to `MetabaseProvider`:

- `authConfig` (Required). Defines how to authenticate with Metabase.
- `theme` (Optional) See [Appearance](./appearance.md).
- `pluginsConfig` (Optional). See [Plugins](./plugins.md).
- `eventHandlers` (Optional). See [Global event handlers](#global-event-handlers).
- `className` (Optional). Classes to be added to the wrapper element.
- `locale` (Optional). Defines the display language. Accepts an ISO language code such as `en` or `de`.
- `loaderComponent` (Optional). A custom loader component to display while the SDK is loading.
- `errorComponent` (Optional). A custom error component to display when the SDK encounters an error.
- `allowConsoleLog` (Optional). If `true`, log messages will be printed to the console.

## Example `config` object passed to `MetabaseProvider`

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-theme.tsx" %}
```

## Global event handlers

`MetabaseProvider` also supports `eventHandlers`.

Currently, we support:

- `onDashboardLoad?: (dashboard: Dashboard | null) => void;`. Triggers when a dashboard loads with all visible cards and their content
- `onDashboardLoadWithoutCards?: (dashboard: Dashboard | null) => void;`. Triggers after a dashboard loads, but without its cards (at this stage only the dashboard title, tabs, and cards grid are rendered, but the contents of the cards have yet to load.

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-event-handlers.tsx" snippet="example" %}
```

## Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to show the latest data, you can do so by using the `key` prop to force a component to reload.

```typescript
{% include_file "{{ dirname }}/snippets/config/reload-metabase-provider.tsx" snippet="example" %}
```
