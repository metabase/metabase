---
title: Embedded analytics SDK - plugins
---

# Embedded analytics SDK - plugins

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true enterprise-only=true %}

The Metabase Embedding SDK supports plugins to customize the behavior of components. These plugins can be used in a global context or on a per-component basis.

## Global plugins

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript
{% raw %}
<MetabaseProvider
    config={config}
    theme={theme}
    pluginsConfig={{
        mapQuestionClickActions: [...] // Add your custom actions here
    }}
>
    {children}
</MetabaseProvider>
{% endraw %}
```

## Component plugins

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript
{% raw %}
<InteractiveQuestion
    questionId={1}
    plugins={{
        mapQuestionClickActions: [...],
    }}
/>
{% endraw %}
```

## Further reading

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#dashboard-plugins)
