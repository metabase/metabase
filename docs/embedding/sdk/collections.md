---
title: Modular embedding SDK - collections
summary: Embed Metabase collection browser in your application using the MetabaseProvider SDK component.
---

# Modular embedding SDK - collections

{% include plans-blockquote.html feature="Modular embedding SDK" sdk=true %}

## Embedding a collection browser

You can embed Metabase's collection browser so that people can explore items in your Metabase from your application.

### `CollectionBrowser`

#### API Reference

- [Component](./api/CollectionBrowser.html)
- [Props](./api/CollectionBrowserProps.html)

#### Example

```tsx
{% include_file "{{ dirname }}/snippets/collections/collection-browser.tsx" %}
```

#### Props

{% include_file "{{ dirname }}/api/snippets/CollectionBrowserProps.md" snippet="properties" %}

## Hide the collection picker and hard code the collection you want people to save stuff to

With static questions, you set a specific collection as the collection people can save items to, so that they don't have bother picking a collection. To hard-code a collection:

1. Set `isSaveEnabled` to true.
2. Set `targetCollection` to the collection ID you want people to save items to.

For more options, see [Question props](./questions.md).
