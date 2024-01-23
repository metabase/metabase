import React, { useEffect, useState, useCallback, ReactElement } from "react";

import { useSelector } from "metabase/lib/redux";
import type { Collection, SearchResult } from "metabase-types/api";
import { CollectionsApi, UserApi } from "metabase/services";

import { PERSONAL_COLLECTIONS } from "metabase/entities/collections";
import { getUserIsAdmin } from "metabase/selectors/user";
import { LoadingSpinner, NestedItemPicker } from "../components";
import type { PickerState, PickerStateItem } from "../types";
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

export const CollectionPicker = ({
  onItemSelect,
  value,
  options = defaultOptions,
}: CollectionPickerProps) => {
  const [path, setPath] = useState<PickerState<SearchResult>>(() => {
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
          collectionsData.push(personalCollectionsRoot);
        }
      }

      return collectionsData;
    };

    return [
      {
        ListComponent: ItemList,
        dataFn,
        selectedItem: { model: "collection", id: "root" },
      },
      {
        ListComponent: EntityItemList,
        query: {
          collection: "root",
          models: ["collection"],
          namespace: options.namespace,
        },
        selectedItem: null,
      },
    ];
  });

  //console.log(path);

  const isAdmin = useSelector(getUserIsAdmin);

  const { data: currentCollection, isLoading: loadingCurrentCollection } =
    useCollectionQuery({ id: value?.id, enabled: !!value?.id });

  const onFolderSelect = ({
    folder,
    level,
  }: {
    folder: Partial<SearchResult>;
    level: number;
  }) => {
    setPath(
      generatePath({
        path,
        folder,
        index: level,
        options,
        isAdmin,
      }),
    );
  };

  useEffect(() => {
    console.log("effectin", [currentCollection, value?.id, options.namespace]);
    if (value?.id && currentCollection) {
      const [firstStep, ...steps] = getCollectionIdPath(currentCollection);
      console.log(firstStep, steps);
      let _path = [...path];
      steps.forEach((p, i) => {
        _path = generatePath({
          folder: { id: p, model: "collection" },
          index: i,
          isAdmin,
          options,
          path: _path,
        });
      });

      setPath(_path);
    }
  }, [loadingCurrentCollection, value?.id, options.namespace]);

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemModel="question"
      folderModel="collection"
      onFolderSelect={onFolderSelect}
      onItemSelect={onItemSelect}
      path={path}
    />
  );
};

const generatePath = ({ path, folder, index, isAdmin, options }) => {
  const restOfPath = path.slice(0, index + 1);

  restOfPath[restOfPath.length - 1].selectedItem = {
    id: folder.id,
    model: folder.model,
  };

  if (isAdmin && folder.id === (PERSONAL_COLLECTIONS.id as unknown as number)) {
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

      return allRootPersonalCollections;
    };

    return restOfPath.concat({
      ListComponent: ItemList,
      dataFn,
      selectedItem: null,
    });
  } else {
    return restOfPath.concat({
      ListComponent: EntityItemList,
      query: {
        collection: folder.id,
        models: ["collection"],
        namespace: options.namespace,
      },
      selectedItem: null,
    });
  }
};
