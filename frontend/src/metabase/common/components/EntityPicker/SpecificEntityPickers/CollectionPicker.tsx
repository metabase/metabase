import { useEffect, useState, useCallback } from "react";

import { useSelector } from "metabase/lib/redux";
import type { Collection, SearchResult } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";
import Search from "metabase/entities/search";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { getUserIsAdmin } from "metabase/selectors/user";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState } from "../types";


export type CollectionPickerOptions = {
  showPersonalCollections?: boolean;
  showRootCollection?: boolean;
  namespace?: 'snippets';
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

const rootCollection = {
  id: "root",
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

export function CollectionPicker({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) {
  const [initialState, setInitialState] = useState<PickerState<SearchResult>>();
  const isAdmin = useSelector(getUserIsAdmin);

  const onFolderSelect = useCallback(
    async (folder?: Partial<SearchResult>): Promise<SearchResult[]> => {
      if (!folder?.id) {
        const collectionsData = [];

        if (options.showRootCollection || options.namespace === "snippets") {
          const ourAnalytics = await CollectionsApi.getRoot({ namespace: options.namespace });
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
            collectionsData.push({
              ...PERSONAL_COLLECTIONS,
              model: 'collection',
            })
          }
        }

        return collectionsData;
      }

      if (isAdmin && folder.id === PERSONAL_COLLECTIONS.id as unknown as number) { // 🙄
        const allCollections = await CollectionsApi.list();

        const allRootPersonalCollections = allCollections.filter(
          (collection: Collection) => (collection?.is_personal && collection?.location === "/")
        ).map((collection: Collection) => ({ ...collection, model: "collection" }));

        return allRootPersonalCollections;
      }

      // because folders are also selectable items in the collection picker, we always select the folder
      onItemSelect((folder ?? rootCollection) as SearchResult);

      const items = await Search.api.list({
        collection: folder.id,
        models: ["collection"],
        namespace: options.namespace,
      });

      return items.data;
    },
    [onItemSelect, isAdmin, options],
  );

  useEffect(() => {
    if (value?.id) {
      CollectionsApi.get({ id: value.id }).then(async collection => {
        const path = getCollectionIdPath(collection);

        const stack = await Promise.all(
          path.map(async (id, index) => {
            const items = await onFolderSelect({
              id: id as unknown as number,
              model: "collection",
            });
            const selectedItem =
              items.find(item => item.id === path[index + 1]) ?? null;
            return {
              items,
              selectedItem,
            };
          }),
        );

        setInitialState(stack);
      });
    } else {
      // default to showing our analytics selected
      onFolderSelect().then(async items => {
        setInitialState([
          {
            items,
            selectedItem: rootCollection,
          },
          {
            items: await onFolderSelect(rootCollection),
            selectedItem: null,
          },
        ]);
      });
    }
  }, [value?.id, onFolderSelect, onItemSelect]);

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
