import { useMemo } from "react";

import { useGetPersonalCollection } from "metabase/common/hooks/use-get-personal-collection";
import { PERSONAL_COLLECTIONS, ROOT_COLLECTION } from "metabase/entities/collections";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerCollectionItem, OmniPickerFolderItem } from "../../types";
import { ItemListWrapper } from "../helpers";

import { OmniPickerItem } from "./OmniPickerItem";

export function RootItemList() {
  const { setPath } = useOmniPickerContext();
  const { data: personalCollection } = useGetPersonalCollection();

  const rootItems: OmniPickerFolderItem[] = useMemo(() => {
    const items: OmniPickerFolderItem[] = [];
    items.push({ ...ROOT_COLLECTION, model: "collection" } as OmniPickerCollectionItem);
    if (personalCollection) {
      items.push({ ...personalCollection, model: "collection" });
    }
    items.push({ ...PERSONAL_COLLECTIONS, model: "collection" } as OmniPickerCollectionItem);
    return items;
  }, [personalCollection]);

  return (
    <ItemListWrapper>
      {rootItems.map(item => (
        <OmniPickerItem
          key={`${item.model}-${item.id}`}
          name={item.name}
          model={item.model}
          isFolder
          onClick={() => {
            setPath([item]);
          }}
        />
      ))}
    </ItemListWrapper>
  );
}
