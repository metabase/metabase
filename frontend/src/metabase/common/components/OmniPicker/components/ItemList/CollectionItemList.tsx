import { useListCollectionItemsQuery } from "metabase/api";

import type { OmniPickerFolderItem } from "../../types";

import { ItemList } from "./ItemList";

export function CollectionItemList({
  parent, pathIndex,
}: {
  parent: OmniPickerFolderItem, pathIndex: number
}) {
  const { data: items, isLoading, error } = useListCollectionItemsQuery({
    id: parent.id,
  });

  return (
    <ItemList
      items={items?.data}
      isLoading={isLoading}
      error={error}
      pathIndex={pathIndex}
    />
  );
}
