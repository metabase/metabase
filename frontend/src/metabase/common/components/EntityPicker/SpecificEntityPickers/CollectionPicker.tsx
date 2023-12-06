import { useEffect, useState } from "react";

import type { Collection } from "metabase-types/api";
import { CollectionsApi } from "metabase/services";

import { LoadingSpinner } from "../components/LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";
import type { PickerState } from "../types";

interface CollectionPickerProps {
  onItemSelect: (item: Collection) => void;
  initialCollectionId?: number;
}

export function CollectionPicker({
  onItemSelect,
  initialCollectionId,
}: CollectionPickerProps) {
  const [ initialState, setInitialState ] = useState<PickerState<Collection>>();
  const onFolderSelect = async (folder?: Partial<Collection>): Promise<Collection[]> => {
    const items = await CollectionsApi.listItems(
      { id: folder?.id ?? "root", models: ["collection"] },
    );

    return items.data;
  };

  useEffect(() => {
    if (initialCollectionId) {
      CollectionsApi
        .listItems({ id: initialCollectionId })
        .then(async (collection) => {
          const path = [
            "root",
            ...collection.location.split("/"),
            initialCollectionId,
          ].filter(Boolean);

          const stack = await Promise.all(
            path.map(async (id, index) => {
              setInitialState({
                items: await onFolderSelect({ id }),
                selectedItem: path[index + 1] ?? null,
              });
            }),
          );
          return stack;
        });
    } else {
      onFolderSelect({ id: "root" }).then(items => {
        setInitialState([{ items, selectedItem: null }]);
      });
    }
  }, [initialCollectionId]);


  if (!initialState) {
    return <LoadingSpinner />;
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
