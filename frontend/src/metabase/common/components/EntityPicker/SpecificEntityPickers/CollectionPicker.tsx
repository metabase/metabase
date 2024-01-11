import { useEffect, useState, useCallback, forwardRef } from "react";

import { useSelector } from "metabase/lib/redux";
import type { Collection, SearchResult } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";
import Search from "metabase/entities/search";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { getUserIsAdmin } from "metabase/selectors/user";
import { isRootCollection } from "metabase/collections/utils";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState } from "../types";
import { ItemList } from "../components/ItemList";
import { EntityItemList } from "../components/EntityItemList";
import { useCollectionQuery } from "metabase/common/hooks";

export type CollectionPickerOptions = {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: "snippets";
};

const defaultOptions: CollectionPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
};

interface CollectionPickerProps {
  onItemSelect: (item: SearchResult) => void;
  value?: Partial<SearchResult>;
  options?: CollectionPickerOptions;
}

const personalCollectionsRoot = {
  ...PERSONAL_COLLECTIONS,
  can_write: false,
  model: "collection",
} as unknown as SearchResult;

function getCollectionIdPath(collection: Collection) {
  const pathFromRoot =
    collection?.location?.split("/").filter(Boolean).map(Number) ?? [];

  const path = collection.is_personal
    ? [null, ...pathFromRoot, collection.id]
    : [null, "root", ...pathFromRoot, collection.id];

  return path;
}

export const CollectionPicker = forwardRef(function CollectionPickerInner(
  { onItemSelect, value, options = defaultOptions }: CollectionPickerProps,
  ref,
) {
  const [initialState, setInitialState] = useState<PickerState<SearchResult>>();
  const isAdmin = useSelector(getUserIsAdmin);

  const { data: rootCollection, isLoading: loadingRootCollection } =
    useCollectionQuery({ id: "root" });
  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({ id: value?.id, enabled: !!value?.id });

  const onFolderSelect = useCallback(
    (folder?: Partial<SearchResult>): Promise<SearchResult[]> => {
      if (!folder?.id) {
        console.log("No Folder ID");
        const dataFn = async () => {
          const collectionsData = [];

          if (options.showRootCollection || options.namespace === "snippets") {
            const ourAnalytics = await CollectionsApi.getRoot({
              namespace: options.namespace,
            });
            collectionsData.push({
              ...ourAnalytics,
              model: "collection",
              id: "root",
            });

            // default to selecting our analytics
            onItemSelect(ourAnalytics);
          }

          if (
            options.showPersonalCollections &&
            options.namespace !== "snippets"
          ) {
            const currentUser = await UserApi.current();
            const personalCollection = await CollectionsApi.get({
              id: currentUser.personal_collection_id,
            });
            collectionsData.push({
              ...personalCollection,
              model: "collection",
            });

            if (isAdmin) {
              collectionsData.push(personalCollectionsRoot);
            }
          }

          return collectionsData;
        };

        return {
          listComponent: ItemList,
          dataFn,
        };
      }

      if (
        isAdmin &&
        folder.id === (PERSONAL_COLLECTIONS.id as unknown as number)
      ) {
        console.log("Personal Collections");
        const dataFn = async () => {
          const allCollections = await CollectionsApi.list();

          const allRootPersonalCollections = allCollections
            .filter(
              (collection: Collection) =>
                collection?.is_personal && collection?.location === "/",
            )
            .map((collection: Collection) => ({
              ...collection,
              model: "collection",
            }));

          onItemSelect(personalCollectionsRoot);

          return allRootPersonalCollections;
        };

        return {
          listComponent: ItemList,
          dataFn,
        };
      }

      // because folders are also selectable items in the collection picker, we always select the folder
      if (folder) {
        onItemSelect(folder as SearchResult);
      }

      console.log("got a folder", folder);
      return {
        listComponent: EntityItemList,
        query: {
          collection: folder.id,
          models: ["collection"],
          namespace: options.namespace,
        },
      };
    },
    [onItemSelect, isAdmin, options],
  );

  useEffect(() => {
    if (value?.id && currentCollection) {
      const [firstStep, ...path] = getCollectionIdPath(currentCollection);
      console.log(firstStep, path);

      setInitialState([
        {
          ...onFolderSelect(),
          selectedItem: {
            model: "collection",
            id: path[0],
          },
        },
        ...path.map((step, index, arr) => ({
          listComponent: EntityItemList,
          query: {
            collection: step,
            models: ["collection"],
            namespace: options.namespace,
          },
          selectedItem: {
            model: "collection",
            id: index + 1 < arr.length ? arr[index + 1] : undefined,
          },
        })),
      ]);
    } else {
      // default to showing our analytics selected
      setInitialState([
        {
          ...onFolderSelect(),
          selectedItem: { model: "collection", id: "root" },
        },
        { ...onFolderSelect(rootCollection) },
      ]);
    }
  }, [
    currentCollection,
    rootCollection,
    onFolderSelect,
    onItemSelect,
    options.namespace,
  ]);

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
      ref={ref}
    />
  );
});
