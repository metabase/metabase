import type { Ref } from "react";
import { forwardRef, useCallback, useImperativeHandle, useMemo } from "react";
import { useDeepCompareEffect } from "react-use";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { CollectionItemModel, Dashboard } from "metabase-types/api";

import { LoadingSpinner, NestedItemPicker } from "../../../../EntityPicker";
import { CollectionItemPickerResolver } from "../../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../../CollectionPicker/utils";
import { useGetInitialContainer } from "../../../hooks";
import { getCollectionIdPath, getStateFromIdPath } from "../../../utils";
import type {
  DashboardPickerItem,
  DashboardPickerOptions,
  DashboardPickerStatePath,
} from "../../types";
import {
  handleNewDashboard as handleNewDashboardUtil,
  isFolder,
} from "../../utils";

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
  } = useGetInitialContainer(initialValue);

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
      handleNewDashboardUtil(
        newDashboard,
        path,
        onItemSelect,
        userPersonalCollectionId,
        handleItemSelect,
        onPathChange,
      );
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
      // This can really be driven from currentDashboard.collection, and we should not be looking at currentCollection at all.
      if (currentCollection?.id) {
        const idPath = getCollectionIdPath(
          {
            ...currentCollection,
            model: "collection",
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
