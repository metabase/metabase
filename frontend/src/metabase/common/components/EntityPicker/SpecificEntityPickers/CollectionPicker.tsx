import { useEffect, useState, useCallback } from "react";

import type { Collection } from "metabase-types/api";
import { CollectionsApi } from "metabase/services";

import { LoadingSpinner } from "../components/LoadingSpinner";
import { NestedItemPicker } from "../NestedItemPicker";
import type { PickerState } from "../types";

interface CollectionPickerProps {
  onItemSelect: (item: Partial<Collection>) => void;
  value?: Partial<Collection>;
}

export function CollectionPicker({
  onItemSelect,
  value,
}: CollectionPickerProps) {
  const [ initialState, setInitialState ] = useState<PickerState<Collection>>();

  const onFolderSelect = useCallback(async (folder?: Partial<Collection>): Promise<Collection[]> => {
    onItemSelect(folder ?? { id: 'root' });
    const items = await CollectionsApi.listItems(
      { id: folder?.id ?? "root", models: ["collection"] },
    );

    if (folder?.id === "root") {
      const ourAnalytics = await CollectionsApi.getRoot();
      items.data.unshift({ ...ourAnalytics, model: 'collection', id: 'root' } );
    }

    return items.data;
  }, [onItemSelect]);

  useEffect(() => {
    console.log({ value })
    if (value?.id) {
      CollectionsApi
        .get({ id: value.id })
        .then(async (collection) => {
          const path = [
            "root",
            ...collection.location.split("/").map(Number),
            value.id,
          ].filter(Boolean);



          const stack = await Promise.all(
            path.map(async (id, index) => {
              const items = await onFolderSelect({ id });
              const selectedItem = items.find(item => item.id === path[index + 1]) ?? null;
              return({
                items,
                selectedItem,
              });
            }),
          );

          console.log({ path, stack })

          setInitialState(stack);
        });
    } else {
      onFolderSelect({ id: "root" }).then(items => {
        setInitialState([{ items, selectedItem: null }]);
      });
    }
  }, [value?.id, onFolderSelect]);

  console.log({ initialState })


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
