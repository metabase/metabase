---
title: Embedded analytics SDK - plugins
---

# Embedded analytics SDK - plugins

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

The Metabase Embedded analytics SDK supports plugins to customize the behavior of components. These plugins can be used in a global context or on a per-component basis.

## Global plugins

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/global-plugins.tsx" snippet="example" %}
```

## Component plugins

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/component-plugins.tsx" snippet="example" %}
```

## Further reading

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#dashboard-plugins)
