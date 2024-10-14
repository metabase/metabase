---
title: Embedded analytics SDK plugins
---

# Embedded analytics SDK plugins

The Metabase Embedding SDK supports plugins to customize the behavior of components. These plugins can be used in a global context or on a per-component basis.

To use a plugin globally, add the plugin to the `MetabaseProvider`'s `pluginsConfig` prop:

```typescript jsx
<MetabaseProvider
    config={config}
    theme={theme}
    pluginsConfig={{
        mapQuestionClickActions: [...] // Add your custom actions here
    }}
>
    {children}
</MetabaseProvider>
```

To use a plugin on a per-component basis, pass the plugin as a prop to the component:

```typescript jsx
<InteractiveQuestion
    questionId={1}
    plugins={{
        mapQuestionClickActions: [...],
    }}
/>
```

## Further reading

- [Interactive question plugins](./questions.md#interactive-question-plugins)
- [Dashboard plugins](./dashboards.md#interactive-dashboard-plugins)
