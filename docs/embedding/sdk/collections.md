---
title: Embedded analytics SDK - collections
---

# Embedded analytics SDK - collections

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can embed Metabase's collection browser so that people can explore items in your Metabase from your application.

## `CollectionBrowser` props

| Prop               | Type                                               | Description                                                                                                                                                                                                                                                                                                                            |
| ------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collectionId       | `number \| 'root' \| 'personal'`                   | The numerical ID of the collection, "personal" for the user's personal collection, or "root" for the root collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. Defaults to "personal" |
| onClick            | `(item: CollectionItem) => void`                   | An optional click handler that emits the clicked entity.                                                                                                                                                                                                                                                                               |
| pageSize           | `number`                                           | The number of items to display per page. The default is 25.                                                                                                                                                                                                                                                                            |
| visibleEntityTypes | `["question", "model", "dashboard", "collection"]` | The types of entities that should be visible. If not provided, all entities will be shown.                                                                                                                                                                                                                                             |

## Example embedding code with `CollectionBrowser`

```tsx
{% include_file "{{ dirname }}/snippets/collections/collection-browser.tsx" %}
```

## Hide the collection picker and hard code the collection you want people to save stuff to

With static questions, you set a specific collection as the collection people can save items to, so that they don't have bother picking a collection. To hard-code a collection:

1. Set `isSaveEnabled` to true.
2. Set `targetCollection` to the collection ID you want people to save items to.

For more options, see [Question props](./questions.md#question-props).
