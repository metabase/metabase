---
title: Modular embedding components
summary: Embed dashboards, questions, query builder, AI chat, and a collection browser.
---

# Modular embedding components

There are different components you can embed, each with various options.

> While you can use component parameters to show or hide parts of the embedded component, these parameters are _not_ a substitute for [permissions](../permissions/start.md). Even if you hide stuff, people could still grab their token from the frontend and use it to query the Metabase API.

This page covers what you can embed. For theming your embeds, see [Appearance](./appearance.md).

## Dashboard

To render a dashboard:

```html
<metabase-dashboard dashboard-id="1" with-title="true" with-downloads="false">
</metabase-dashboard>
```

### Attributes

{% include_file "{{ dirname }}/eajs/snippets/MetabaseDashboardAttributes.md" snippet="properties" %}

For all modular embeds, you can also set a `locale` in your page-level configuration to [translate embedded content](./translations.md), including content from translation dictionaries.

If you surround your attribute value with double quotes, make sure to use single quotes:

```html
<metabase-dashboard
  dashboard-id="1"
  initial-parameters="{ 'productId': '42' }"
></metabase-dashboard>
```

If you surround your attribute value with double quotes, make sure to use single quotes:

```html
<metabase-dashboard
  dashboard-id="1"
  hidden-parameters="['productId']"
></metabase-dashboard>
```

## Resizing dashboards to fit their content

The `<metabase-dashboard>` web component automatically resizes to fit its content. No additional configuration is needed.

## Question

To render a question (chart):

```html
<metabase-question question-id="1"></metabase-question>
```

### Attributes

{% include_file "{{ dirname }}/eajs/snippets/MetabaseQuestionAttributes.md" snippet="properties" %}

## Browser

{% include plans-blockquote.html feature="Browser component" convert_pro_link_to_embbedding=true%}

Browser component is only available for authenticated modular embeds. It's unavailable for [Guest embeds](./guest-embedding.md).

To render a collection browser so people can navigate a collection and open dashboards or questions:

```html
<metabase-browser
  initial-collection="14"
  read-only="false"
  collection-entity-types="['collection', 'dashboard']"
>
</metabase-browser>
```

### Attributes

{% include_file "{{ dirname }}/eajs/snippets/MetabaseBrowserAttributes.md" snippet="properties" %}

## AI chat

{% include plans-blockquote.html feature="AI chat component" convert_pro_link_to_embbedding=true%}

AI chat component is only available for authenticated modular embeds. It's unavailable for [Guest embeds](./guest-embedding.md).

To render the AI chat interface:

```html
<metabase-metabot></metabase-metabot>
```

### Attributes

{% include_file "{{ dirname }}/eajs/snippets/MetabaseMetabotAttributes.md" snippet="properties" %}

## Customizing loader and error components

{% include plans-blockquote.html feature="Customizing loader and error componentst" convert_pro_link_to_embbedding=true%}

If you're using the [modular embedding SDK](./sdk/introduction.md), you can provide your own components for loading and error states by specifying `loaderComponent` and `errorComponent` as props to `MetabaseProvider`.

```tsx
{% include_file "{{ dirname }}/sdk/snippets/appearance/customizing-loader-and-components.tsx" snippet="imports" %}

{% include_file "{{ dirname }}/sdk/snippets/appearance/customizing-loader-and-components.tsx" snippet="example" %}
```

## Further reading

- [Appearance](./appearance.md)
- [Modular embedding SDK](./sdk/introduction.md).
