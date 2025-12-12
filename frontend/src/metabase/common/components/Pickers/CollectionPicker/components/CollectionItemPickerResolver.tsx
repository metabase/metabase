import type { OmniPickerFolderItem, OmniPickerItem } from "metabase/common/components/EntityPicker";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { PLUGIN_TENANTS } from "metabase/plugins";


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

  if (query.id === PLUGIN_TENANTS.TENANT_SPECIFIC_COLLECTIONS?.id) {
    return (
      <PLUGIN_TENANTS.TenantSpecificCollectionsItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
        options={options}
      />
    );
  }

  // Route to tenant collection list only for the root tenant collection
  // (not for subcollections within the tenant namespace)
  if (query.id === "tenant") {
    return (
      <PLUGIN_TENANTS.TenantCollectionItemList
        onClick={onClick}
        selectedItem={selectedItem}
        isFolder={isFolder}
        isCurrentLevel={isCurrentLevel}
        shouldDisableItem={shouldDisableItem}
        shouldShowItem={shouldShowItem}
        options={options}
      />
    );
  }

  if (entity === "dashboard") {
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
