import { useState, useEffect } from "react";
import { GET } from "metabase/lib/api";

import type { SearchResult } from "metabase-types/api";

import { NestedItemPicker } from "../components";
import type { PickerState } from "../types";

interface QuestionPickerProps {
  onItemSelect: (item: SearchResult) => void;
  initialCollectionId?: number;
}

const collectionList = GET("/api/collection/:collection/items");
const collectionAPI = GET("/api/collection/:id");

const sortFoldersFirst = (a: SearchResult) => {
  return a.model === "collection" ? -1 : 1;
};

export function QuestionPicker({
  onItemSelect,
  initialCollectionId,
}: QuestionPickerProps) {
  const [initialState, setInitialState] = useState<PickerState<SearchResult>>();

  const onFolderSelect = async (folder?: Partial<SearchResult>): Promise<SearchResult[]> => {
    const items = !folder
      ? await collectionList(
          { collection: "root" },
          { model: ["question", "collection"] },
        )
      : await collectionList(
          { collection: folder.id },
          { model: ["question", "collection"] },
        );

    return items.data.sort(sortFoldersFirst);
  };

  useEffect(() => {
    if (initialCollectionId) {
      collectionAPI({ id: initialCollectionId }).then(async collection => {
        const path = [
          "root",
          ...collection.location.split("/"),
          initialCollectionId,
        ].filter(Boolean);

        const stack = await Promise.all(
          path.map(async (id, index) => {
            return {
              items: (await onFolderSelect({ id })).sort(sortFoldersFirst),
              selectedItem: path[index + 1] ?? null,
            };
          }),
        );
        setInitialState(stack);
      });
    } else {
      onFolderSelect({
        id: "root" as unknown as number,
        model: 'collection'
      }).then(items => {
        items.sort(sortFoldersFirst);
        setInitialState([{ items, selectedItem: null }]);
      });
    }
  }, [initialCollectionId]);

  if (!initialState) {
    return null;
  }

  return (
    <NestedItemPicker
      itemModel="question"
      folderModel="collection"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      initialState={initialState}
    />
  );
}
