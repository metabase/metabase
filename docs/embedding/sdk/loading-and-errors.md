---
title: Customize loading, error, and empty states
summary: "Replace the modular embedding SDK's default loading screen, error screen, and no-results image with your own."
---

# Customize loading, error, and empty states

![A custom error component rendering its own image and message in place of a chart](../images/custom-error.png)

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

While an embedded component is loading, when it fails, or when a query comes back with no rows, the [modular embedding SDK](./introduction.md) renders a screen of its own. You can swap in your own React components and images instead, so all three states match the rest of your app.

These customizations are SDK only. `loaderComponent` and `errorComponent` are props on `MetabaseProvider`, the no-results image comes from a [plugin](./plugins.md), and there's no web component equivalent for any of them.

## Replace the loading and error components

Pass `loaderComponent` and `errorComponent` to `MetabaseProvider`. Every embedded component inside that provider picks them up.

```tsx
{% include_file "{{ dirname }}/snippets/appearance/customizing-loader-and-components.tsx" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/appearance/customizing-loader-and-components.tsx" snippet="example" %}
```

`loaderComponent` receives an optional `label` prop with the loading message, which you can render or ignore. `errorComponent` receives the error details, so you can decide how much of the error to show, and where to put it.

## Error component props

These are the props Metabase passes to your `errorComponent`. The `type` prop tells you how Metabase intended to display the error: `relative` errors sit in the flow of the component, while `fixed` errors are meant to overlay the page, like a toast.

{% include_file "{{ dirname }}/api/snippets/SdkErrorComponentProps.md" snippet="properties" %}

## Replace the no-results illustration

By default, Metabase displays a sailboat image when a query returns no results. To use a different image, set the `getNoDataIllustration` and `getNoObjectIllustration` plugins.

Unlike `loaderComponent` and `errorComponent`, these are [plugins](./plugins.md), so they go in `pluginsConfig` rather than being props of their own. And instead of a React component, each one returns a base64-encoded image:

```typescript
{% include_file "{{ dirname }}/snippets/plugins/custom-images.tsx" snippet="example" %}
```

`getNoDataIllustration` covers a query that came back with no rows. `getNoObjectIllustration` covers a search that turned up nothing, like a search page or an entity picker with no matches. Both can only be set [globally](./plugins.md#plugin-scope), on the provider.

## Further reading

- [Modular embedding SDK plugins](./plugins.md)
- [Appearance](../appearance.md)
- [Modular embedding SDK config](./config.md)
- [Modular embedding components](../components.md)
