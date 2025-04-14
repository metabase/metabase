---
title: Embedded analytics SDK - collections
---

# Embedded analytics SDK - collections

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can embed Metabase's collection browser so that people can explore items in your Metabase from your application.

Docs: [CollectionBrowser](./api/CollectionBrowser.html)

## Example embedding code with `CollectionBrowser`

```tsx
{% include_file "{{ dirname }}/snippets/collections/collection-browser.tsx" %}
```

## Hide the collection picker and hard code the collection you want people to save stuff to

With static questions, you set a specific collection as the collection people can save items to, so that they don't have bother picking a collection. To hard-code a collection:

1. Set `isSaveEnabled` to true.
2. Set `targetCollection` to the collection ID you want people to save items to.

For more options, see [Question props](./questions.md).
