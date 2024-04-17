import { useCallback, useState } from "react";
import { useDeepCompareEffect } from "react-use";
import { t } from "ttag";

import { isValidCollectionId } from "metabase/collections/utils";
import { useCollectionQuery, useDashboardQuery } from "metabase/common/hooks";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { useSelector } from "metabase/lib/redux";
import { getUserPersonalCollectionId } from "metabase/selectors/user";
import type { SearchRequest, SearchModel } from "metabase-types/api";

import { CollectionItemPickerResolver } from "../../CollectionPicker/components/CollectionItemPickerResolver";
import { getPathLevelForItem } from "../../CollectionPicker/utils";
import {
  LoadingSpinner,
  NestedItemPicker,
  type PickerState,
} from "../../EntityPicker";
import type { DashboardPickerOptions, DashboardPickerItem } from "../types";
import {
  generateKey,
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
  onItemSelect: (item: DashboardPickerItem) => void;
  initialValue?: Pick<DashboardPickerItem, "model" | "id">;
  options: DashboardPickerOptions;
  models?: SearchModel[];
}

const useGetInitialCollection = (
  initialValue?: Pick<DashboardPickerItem, "model" | "id">,
) => {
  const isDashboard =
    initialValue && ["dashboard"].includes(initialValue.model);

  const dashboardId = isDashboard ? Number(initialValue.id) : undefined;

  const { data: currentDashboard, error: dashboardError } = useDashboardQuery({
    id: dashboardId,
    enabled: !!dashboardId,
  });

  const collectionId =
    isDashboard && currentDashboard
      ? currentDashboard?.collection_id
      : initialValue?.id;

  const { data: currentCollection, error: collectionError } =
    useCollectionQuery({
      id: (isValidCollectionId(collectionId) && collectionId) || "root",
      enabled: !isDashboard || !!currentDashboard,
    });

    console.log({currentCollection, currentDashboard, collectionError, dashboardError});

  return {
    currentDashboard: currentDashboard,
    currentCollection,
    isLoading: !currentCollection,
    error: dashboardError ?? collectionError,
  };
};

export const DashboardPicker = ({
  onItemSelect,
  initialValue,
  options,
  models = ["dashboard"],
}: DashboardPickerProps) => {
  const [path, setPath] = useState<
    PickerState<DashboardPickerItem, SearchRequest>
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
      const newPath = getStateFromIdPath({
        idPath: getCollectionIdPath(folder, userPersonalCollectionId),
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

  useDeepCompareEffect(
    function setInitialPath() {
      if (currentCollection?.id) {
        const newPath = getStateFromIdPath({
          idPath: getCollectionIdPath(
            {
              id: currentCollection.id,
              location: currentCollection.location,
              is_personal: currentCollection.is_personal,
            },
            userPersonalCollectionId,
          ),
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
    <LoadingAndErrorWrapper error={error} />;
  }

  if (loadingCurrentCollection) {
    return <LoadingSpinner />;
  }

  return (
    <NestedItemPicker
      itemName={t`dashboard`}
      isFolder={isFolder}
      options={options}
      generateKey={generateKey}
      onFolderSelect={onFolderSelect}
      onItemSelect={handleItemSelect}
      path={path}
      listResolver={CollectionItemPickerResolver}
    />
  );
};
