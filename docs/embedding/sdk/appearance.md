---
version: v0.53
has_magic_breadcrumbs: true
show_category_breadcrumb: true
show_title_breadcrumb: true
category: Embedding
title: Embedded analytics SDK - appearance
source_url: >-
  https://github.com/metabase/metabase/blob/master/docs/embedding/sdk/appearance.md
layout: new-docs
latest: true
---

# Embedded analytics SDK - appearance

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can style your embedded Metabase components with a theme.

Here's an example that includes the various styling options available:

```ts
{% include_file "{{ dirname }}/snippets/theme.ts" %}
```

### Customizing loader and error components

You can provide your own components for loading and error states by specifying `loaderComponent` and `errorComponent` as props to `MetabaseProvider`.

```tsx
{% include_file "{{ dirname }}/snippets/customizing-loader-and-components.tsx" snippet="imports" %}

{% include_file "{{ dirname }}/snippets/customizing-loader-and-components.tsx" snippet="example" %}
```

## Limitations

Colors configured in a question's visualization settings will override theme colors.
