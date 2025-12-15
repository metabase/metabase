---
title: Modular embedding SDK - plugins
summary: Customize modular embedding SDK components with plugins. Control click actions, link handling, and no-data illustrations globally or per-component.
---

# Modular embedding SDK - plugins

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

The Metabase modular embedding SDK supports plugins to customize the behavior of components. These plugins can be used in a global context or on a per-component basis.

## Plugin scope

### Global plugins

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/global-plugins.tsx" snippet="example" %}
```

### Component plugins

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/component-plugins.tsx" snippet="example" %}
```

See docs for specific components:

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#dashboard-plugins)

## Global plugins

### `mapQuestionClickActions`

The plugin `mapQuestionClickActions` lets you to customize what happens when people click on a data point on a dashboard or chart. `mapQuestionClickActions` can be used globally, or on component level.

See [`mapQuestionClickActions` plugin](./questions.md#mapquestionclickactions) for more information and examples.

### `handleLink`

To customize what happens when people click a link in your embedded questions and dashboards, use the global plugin `handleLink`:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/handlelink.tsx" snippet="example" %}
```

The plugin `handleLink` can only be used [globally](#plugin-scope) on provider level.

### `getNoDataIllustration` and `getNoObjectIllustration`

By default, Metabase displays a sailboat image when a query returns no results. To use a different image, you can use `getNoDataIllustration` and `getNoObjectIllustration` plugins which can accept a custom base64-encoded image:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/custom-images.tsx" snippet="example" %}
```

The plugins `getNoDataIllustration` and `getNoObjectIllustration` can only be used [globally](#plugin-scope) on provider level.

## Further reading

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#dashboard-plugins)
