import { PERSONAL_COLLECTION, PERSONAL_COLLECTIONS, ROOT_COLLECTION } from "metabase/entities/collections";

import { useOmniPickerContext } from "../../context";
import type { OmniPickerFolderItem } from "../../types";

import { OmniPickerItem } from "./OmniPickerItem";
import { ItemListWrapper } from "../helpers";

export function RootItemList() {
  const { setPath } = useOmniPickerContext();
  const rootItems: OmniPickerFolderItem[] = [];

  rootItems.push(ROOT_COLLECTION);
  rootItems.push(PERSONAL_COLLECTION);
  rootItems.push(PERSONAL_COLLECTIONS);

  return (
    <ItemListWrapper>
      {rootItems.map(item => (
        <OmniPickerItem
          key={`${item.model}-${item.id}`}
          name={item.name}
          model={item.model}
          isFolder
          onClick={() => {
            setPath(prevPath => ([
              ...prevPath,
              item,
            ]));
          }}
        />
      ))}
    </ItemListWrapper>
  );
}
