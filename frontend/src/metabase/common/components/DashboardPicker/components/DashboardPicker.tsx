import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import { useDeepCompareEffect } from "react-use";

import {
  skipToken,
  useGetCollectionQuery,
  useGetDashboardQuery,
} from "metabase/api";
import { isValidCollectionId } from "metabase/collections/utils";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionItemModel, Dashboard } from "metabase-types/api";

import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import { LoadingSpinner, NestedItemPicker } from "../../EntityPicker";
import type {
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerStatePath,
} from "../types";
import {
  getCollectionId,
  getCollectionIdPath,
  getStateFromIdPath,
  isFolder,
} from "../utils";

export const defaultOptions: DashboardPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  allowCreateNew: true,
};

interface DashboardPickerProps {
  initialValue?: Pick<DashboardPickerItem, "model" | "id">;
  options: DashboardPickerOptions;
  models?: CollectionItemModel[];
  path: DashboardPickerStatePath | undefined;
  shouldDisableItem?: (item: DashboardPickerItem) => boolean;
  onItemSelect: (item: DashboardPickerItem) => void;
  onPathChange: (path: DashboardPickerStatePath) => void;
}

const useGetInitialCollection = (
  initialValue?: Pick<DashboardPickerItem, "model" | "id">,
) => {
  const isDashboard = initialValue?.model === "dashboard";

  const dashboardId = isDashboard ? Number(initialValue.id) : undefined;

  const { data: currentDashboard, error: dashboardError } =
    useGetDashboardQuery(
      dashboardId
        ? {
            id: dashboardId,
          }
        : skipToken,
    );

  const collectionId =
    isDashboard && currentDashboard
      ? currentDashboard?.collection_id
      : initialValue?.id;

  const requestCollectionId =
    (isValidCollectionId(collectionId) && collectionId) || "root";

  const { data: currentCollection, error: collectionError } =
    useGetCollectionQuery(
      !isDashboard || !!currentDashboard
        ? { id: requestCollectionId }
        : skipToken,
    );

  return {
    currentDashboard: currentDashboard,
    currentCollection,
    isLoading: !currentCollection,
    error: dashboardError ?? collectionError,
  };
};

const DashboardPickerInner = (
  {
    initialValue,
    options,
    models = ["dashboard"],
    path: pathProp,
    shouldDisableItem,
    onItemSelect,
    onPathChange,
  }: DashboardPickerProps,
  ref: Ref<unknown>,
) => {
  const defaultPath = useMemo(() => {
    return getStateFromIdPath({ idPath: ["root"], models });
  }, [models]);
  const path = pathProp ?? defaultPath;

  const {
    currentCollection,
    currentDashboard,
    error,
    isLoading: loadingCurrentCollection,
  } = useGetInitialCollection(initialValue);

  const userPersonalCollectionId = useSelector(getUserPersonalCollectionId);

  const onFolderSelect = useCallback(
    ({ folder }: { folder: DashboardPickerItem }) => {
      const idPath = getCollectionIdPath(folder, userPersonalCollectionId);

      const newPath = getStateFromIdPath({
        idPath,
        models,
      });
      onPathChange(newPath);
      onItemSelect(folder);
    },
    [onPathChange, onItemSelect, userPersonalCollectionId, models],
  );

  const handleItemSelect = useCallback(
    (item: DashboardPickerItem) => {
      // set selected item at the correct level
      const pathLevel = getPathLevelForItem(
        item,
        path,
        userPersonalCollectionId,
      );

      const newPath = path.slice(0, pathLevel + 1);
      newPath[newPath.length - 1].selectedItem = item;
      onPathChange(newPath);
      onItemSelect(item);
    },
    [onPathChange, onItemSelect, path, userPersonalCollectionId],
  );

  const handleNewDashboard = useCallback(
    (newDashboard: Dashboard) => {
      const newCollectionItem: DashboardPickerItem = {
        id: newDashboard.id,
        name: newDashboard.name,
        collection_id: newDashboard.collection_id || "root",
        model: "dashboard",
      };

      // Needed to satisfy type between DashboardPickerItem and the query below.
      const parentCollectionId = getCollectionId(newCollectionItem);

      //Is the parent collection already in the path?
      const isParentCollectionInPath =
        getPathLevelForItem(newCollectionItem, path, userPersonalCollectionId) >
        0;

      if (!isParentCollectionInPath) {
        onPathChange([
          ...path,
          {
            query: {
              id: parentCollectionId,
              models: ["collection", "dashboard"],
            },
            selectedItem: newCollectionItem,
          },
        ]);
        onItemSelect(newCollectionItem);
        return;
      }
      handleItemSelect(newCollectionItem);
    },
    [
      path,
      onItemSelect,
      userPersonalCollectionId,
      handleItemSelect,
      onPathChange,
    ],
  );

  // Exposing onNewDashboard so that parent can select newly created
  // folder
  useImperativeHandle(
    ref,
    () => ({
      onNewDashboard: handleNewDashboard,
    }),
    [handleNewDashboard],
  );

  useDeepCompareEffect(
    function setInitialPath() {
      if (currentCollection?.id) {
        const idPath = getCollectionIdPath(
          {
            id: currentCollection.id,
            location: currentCollection.effective_location,
            is_personal: currentCollection.is_personal,
          },
          userPersonalCollectionId,
        );

        const newPath = getStateFromIdPath({
          idPath,
          models,
        });

        if (currentCollection.can_write) {
          // start with the current item selected if we can
          newPath[newPath.length - 1].selectedItem = currentDashboard
            ? {
                id: currentDashboard.id,
                name: currentDashboard.name,
                model: "dashboard",
              }
            : {
                id: currentCollection.id,
                name: currentCollection.name,
                model: "collection",
              };
        }

        onPathChange(newPath);
      }
    },
    [currentCollection, userPersonalCollectionId, onPathChange],
  );

  if (error) {
    return <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      isFolder={isFolder}
      options={options}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
      shouldDisableItem={shouldDisableItem}
    />
  );
};

export const DashboardPicker = forwardRef(DashboardPickerInner);
