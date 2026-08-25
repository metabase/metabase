---
title: Customize loading and error states
summary: "Replace the modular embedding SDK's default loading and error components with your own React components."
---

# Customize loading and error states

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true convert_pro_link_to_embedding=true %}

While an embedded component is loading, or when it fails, the [modular embedding SDK](./introduction.md) renders its own loading and error screens. You can swap in your own React components instead, so both states match the rest of your app.

Loading and error components are SDK only. `loaderComponent` and `errorComponent` are props on `MetabaseProvider`, and there's no web component equivalent.

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

## Further reading

- [Appearance](../appearance.md)
- [Modular embedding SDK config](./config.md)
- [Modular embedding components](../components.md)
