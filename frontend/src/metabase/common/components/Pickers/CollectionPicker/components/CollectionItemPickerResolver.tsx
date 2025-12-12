import type { OmniPickerFolderItem, OmniPickerItem } from "metabase/common/components/EntityPicker";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";


import { CollectionItemList } from "./CollectionItemList";
import { DashboardItemList } from "./DashboardItemList";
import { DbItemList } from "./DbItemList";
import { PersonalCollectionsItemList } from "./PersonalCollectionItemList";
import { RecentsItemList } from "./RecentsItemList";
import { SearchResultsItemList } from "./SearchResultsItemList";

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

  if (parentItem.id === "search-results") {
    return (
      <SearchResultsItemList />
    );
  }

  if (parentItem.id === "recents") {
    return (
      <RecentsItemList />
    );
  }

  return (
    <CollectionItemList
      parentItem={parentItem}
      pathIndex={pathIndex}
    />
  );
};
