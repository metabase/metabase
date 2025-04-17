---
title: Embedded analytics SDK - config
---

# Embedded analytics SDK - config

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

To use the SDK in your app, you need to import the `MetabaseProvider` component and provide it with an `authConfig` object.

Docs: [MetabaseProvider](./api/MetabaseProvider.html)

```typescript
{% include_file "{{ dirname }}/snippets/config/config-base.tsx" snippet="example" %}
```

## Example `config` object passed to `MetabaseProvider`

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-theme.tsx" %}
```

## Global event handlers

`MetabaseProvider` also supports `eventHandlers`.

Docs: [SdkEventHandlersConfig](./api/internal/SdkEventHandlersConfig.html)

```typescript
{% include_file "{{ dirname }}/snippets/config/config-with-event-handlers.tsx" snippet="example" %}
```

## Reloading Metabase components

In case you need to reload a Metabase component, for example, your users modify your application data and that data is used to render a question in Metabase. If you embed this question and want to force Metabase to reload the question to show the latest data, you can do so by using the `key` prop to force a component to reload.

```typescript
{% include_file "{{ dirname }}/snippets/config/reload-metabase-provider.tsx" snippet="example" %}
```
