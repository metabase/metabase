---
title: Embedded analytics SDK - collections
---

## Embedded analytics SDK - collections

{% include beta-blockquote.html %}

{% include plans-blockquote.html feature="Embedded analytics SDK" sdk=true %}

You can embed Metabase's collection browser so that people can explore items in your Metabase from your application.

## `CollectionBrowser` props

| Prop               | Type                                               | Description                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| collectionId       | `number`                                           | The numerical ID of the collection. You can find this ID in the URL when accessing a collection in your Metabase instance. For example, the collection ID in `http://localhost:3000/collection/1-my-collection` would be `1`. If no ID is provided, the collection browser will start at the root `Our analytics` collection, which is ID = 0. |
| onClick            | `(item: CollectionItem) => void`                   | An optional click handler that emits the clicked entity.                                                                                                                                                                                                                                                                                       |
| pageSize           | `number`                                           | The number of items to display per page. The default is 25.                                                                                                                                                                                                                                                                                    |
| visibleEntityTypes | `["question", "model", "dashboard", "collection"]` | The types of entities that should be visible. If not provided, all entities will be shown.                                                                                                                                                                                                                                                     |

## Example embedding code with `CollectionBrowser`

```tsx
import React from "react";
import { CollectionBrowser } from "@metabase/embedding-sdk-react";

export default function App() {
  const collectionId = 123; // This is the collection ID you want to browse
  const handleItemClick = item => {
    console.log("Clicked item:", item);
  };

  // Define the collection item types you want to be visible
  const visibleEntityTypes = ["dashboard", "question", "collection"];

  return (
    <CollectionBrowser
      collectionId={collectionId}
      onClick={handleItemClick}
      pageSize={10}
      visibleEntityTypes={visibleEntityTypes}
    />
  );
}
```

## Hide the collection picker and hard code the collection you want people to save stuff to

With static questions, you set a specific collection as the collection people can save items to, so that they don't have bother picking a collection. To hard-code a collection:

1. Set `isSaveEnabled` to true.
2. Set `saveToCollectionId` to the collection ID you want people to save items to.

For more options, see [Question props](./questions.md#question-props).
