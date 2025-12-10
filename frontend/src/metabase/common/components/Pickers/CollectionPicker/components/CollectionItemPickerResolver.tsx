import _ from "underscore";

import type { OmniPickerFolderItem, OmniPickerItem } from "metabase/common/components/EntityPicker";
import { useOmniPickerContext } from "metabase/common/components/EntityPicker/context";
import { TablePicker } from "metabase/common/components/Pickers/TablePicker";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";

import { RootItemList } from "../../../EntityPicker/components/ItemList/RootItemList";
import type { CollectionItemListProps, CollectionPickerItem } from "../types";

import { CollectionItemList } from "./CollectionItemList";
import { DashboardItemList } from "./DashboardItemList";
import { DbItemList } from "./DbItemList";
import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";

const isDbItem = (item: OmniPickerItem): item is OmniPickerFolderItem => {
  return (
    (item.model === "collection" && item.id === "databases")
    || item.model === "database"
    || item.model === "schema"
  );
}

export const CollectionItemPickerResolver = ({
  parentItem,
  pathIndex,
}: {
  parentItem: OmniPickerFolderItem;
  pathIndex: number;
}) => {
  if (!parentItem) {
    console.error("No parent item");
    return null;
  }

  if (parentItem.id === PERSONAL_COLLECTIONS.id) {
    return (
      <PersonalCollectionsItemList
        pathIndex={pathIndex}
      />
    );
  }

  if (parentItem.model === "dashboard") {
    return (
      <DashboardItemList
        parentItem={parentItem}
        pathIndex={pathIndex}
      />
    );
  }

  if (isDbItem(parentItem)) {
    return (
      <DbItemList
        parentItem={parentItem}
        pathIndex={pathIndex}
      />
    );
  }

  return (
    <CollectionItemList
      parentItem={parentItem}
      pathIndex={pathIndex}
    />
  );
};
