import { useAsync } from "react-use";
import { useSelector } from "metabase/lib/redux";
import type { SearchResult, CollectionItem } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";
import { getUserIsAdmin } from "metabase/selectors/user";
import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import type { EntityPickerOptions } from "../../types";
import { ItemList } from "./ItemList";


const personalCollectionsRoot = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
} as unknown as SearchResult;

interface RootItemListProps {
  onClick: (val: any) => void;
  selectedItem: CollectionItem | null;
  folderModel: string;
  options: EntityPickerOptions;
}
/**
 * This is a special item list that exists "above" our analytics and might include:
 * a) the highest-level collections the user can access (often "our analytics")
 * b) the user's personal collection
 * c) a top level folder including all personal collections (admin only)
 */
export const RootItemList = ({
  onClick,
  selectedItem,
  folderModel,
  options,
}: RootItemListProps) => {
  const isAdmin = useSelector(getUserIsAdmin);

  const { value: data, loading: isLoading } = useAsync(async () => {
    const collectionsData: CollectionItem[] = [];

    if (options.showRootCollection || options.namespace === "snippets") {
      const ourAnalytics = await CollectionsApi.getRoot({
        namespace: options.namespace,
      });

      collectionsData.push({
        ...ourAnalytics,
        model: "collection",
        id: "root",
      });
    }

    if (options.showPersonalCollections && options.namespace !== "snippets") {
      const currentUser = await UserApi.current();
      const personalCollection = await CollectionsApi.get({
        id: currentUser.personal_collection_id,
      });
      collectionsData.push({
        ...personalCollection,
        model: "collection",
      });

      if (isAdmin) {
        collectionsData.push(personalCollectionsRoot as unknown as CollectionItem);
      }
    }

    return collectionsData;
  });

  return (
    <ItemList
      items={data}
      isLoading={isLoading}
      onClick={onClick}
      selectedItem={selectedItem}
      folderModel={folderModel}
    />
  );
};
