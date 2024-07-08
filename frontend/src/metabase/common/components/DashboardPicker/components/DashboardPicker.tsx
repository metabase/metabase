import type { Ref } from "react";
import { useCallback, useState, forwardRef, useImperativeHandle } from "react";
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
import type {
  ListCollectionItemsRequest,
  CollectionItemModel,
  Dashboard,
} from "metabase-types/api";

import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import {
  LoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { DashboardPickerOptions, DashboardPickerItem } from "../types";
import { getCollectionIdPath, getStateFromIdPath, isFolder } from "../utils";

export const defaultOptions: DashboardPickerOptions = {
  showPersonalCollections: true,
  showRootCollection: true,
  allowCreateNew: true,
};

interface DashboardPickerProps {
  onItemSelect: (item: DashboardPickerItem) => void;
  initialValue?: Pick<DashboardPickerItem, "model" | "id">;
  options: DashboardPickerOptions;
  models?: CollectionItemModel[];
  shouldDisableItem?: (item: DashboardPickerItem) => boolean;
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
    onItemSelect,
    initialValue,
    options,
    models = ["dashboard"],
    shouldDisableItem,
  }: DashboardPickerProps,
  ref: Ref<unknown>,
) => {
  const [path, setPath] = useState<
    PickerState<DashboardPickerItem, ListCollectionItemsRequest>
  >(() =>
    getStateFromIdPath({
      idPath: ["root"],
      models,
    }),
  );

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
      setPath(newPath);
      onItemSelect(folder);
    },
    [setPath, onItemSelect, userPersonalCollectionId, models],
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
      setPath(newPath);
      onItemSelect(item);
    },
    [setPath, onItemSelect, path, userPersonalCollectionId],
  );

  const handleNewDashboard = useCallback(
    (newDashboard: Dashboard) => {
      const newCollectionItem: DashboardPickerItem = {
        id: newDashboard.id,
        name: newDashboard.name,
        collection_id: newDashboard.collection_id || "root",
        model: "dashboard",
      };

      handleItemSelect(newCollectionItem);
    },
    [handleItemSelect],
  );

  // Exposing onNewCollection so that parent can select newly created
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

        setPath(newPath);
      }
    },
    [currentCollection, userPersonalCollectionId],
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
