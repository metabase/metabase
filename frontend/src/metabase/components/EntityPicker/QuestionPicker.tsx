import { useState, useEffect } from "react";
import { GET } from "metabase/lib/api";

import type { Collection } from "metabase-types/api";
import type Question from "metabase-lib/Question";

import { EntityPicker } from "./EntityPicker";


interface QuestionPickerProps {
  onItemSelect: (item: Question) => void;
  initialCollectionId?: number
}

const collectionList = GET("/api/collection/:collection/items");
const collectionAPI = GET("/api/collection/:id");

export function QuestionPicker({ onItemSelect, initialCollectionId }: QuestionPickerProps) {
  const [ initialState, setInitialState ] = useState<any>();

  const onFolderSelect = async (folder: Collection) => {
    const items = !folder
     ? await collectionList({collection: 'root' }, {model: ["question", "collection" ]})
     : await collectionList({collection: folder.id }, { model: ["question", "collection" ]});

    return items.data as Collection[];
  };

  useEffect(() => {
    if (initialCollectionId) {
      // FIXME, if the initialCollectionID changes, we'll do all these net requests,
      // but it won't change anything in entity picker
      collectionAPI({ id: initialCollectionId }).then(async (collection) => {
        const path = ['root', ...collection.location.split('/'), initialCollectionId].filter(Boolean);

        const stack = await Promise.all(path.map(async (id, index) => {
          return {
            items: await onFolderSelect({ id }),
            selectedId: path[index+1] ?? null
          }
        }));
        setInitialState(stack);
      });
    } else {
      setInitialState([]);
    }
  }, [initialCollectionId]);

  if (!initialState) {
    return null;
  }

  return (
    <EntityPicker
      itemModel="question"
      folderModel="collection"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  )
}
