---
title: "Embedded analytics SDK - appearance"
---

# Embedded analytics SDK - appearance

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can style your embedded Metabase components with a theme.

Here's an example that includes the various styling options available:

```ts
{% include_file "{{ dirname }}/snippets/appearance/theme.ts" %}
```

### Customizing loader and error components

You can provide your own components for loading and error states by specifying `loaderComponent` and `errorComponent` as props to `MetabaseProvider`.

```tsx
{% include_file "{{ dirname }}/snippets/appearance/customizing-loader-and-components.tsx" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/appearance/customizing-loader-and-components.tsx" snippet="example" %}
```

## Limitations

Colors configured in a question's visualization settings will override theme colors.
