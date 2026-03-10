import { useCallback, useState } from "react";

import {
  Api,
  useListCollectionItemsQuery,
  useUpdateDashboardMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { useDispatch } from "metabase/lib/redux";
import type { CollectionId, CollectionItem } from "metabase-types/api";

const AUTO_GENERATED_DASHBOARDS_COLLECTION_NAME =
  "Automatically Generated Dashboards";

/**
 * Returns the last dashboard from the "Automatically Generated Dashboards"
 * collection, useful for pre-filling the dashboard picker.
 */
export const useLastXrayDashboard = () => {
  const { data: rootItems, isLoading: isLoadingRoot } =
    useListCollectionItemsQuery({
      id: "root",
      models: ["collection"],
    });

  const autoGenCollection = rootItems?.data.find(
    (item: CollectionItem) =>
      item.name === AUTO_GENERATED_DASHBOARDS_COLLECTION_NAME,
  );

  const { data: dashboardItems, isLoading: isLoadingDashboards } =
    useListCollectionItemsQuery(
      autoGenCollection
        ? { id: autoGenCollection.id, models: ["dashboard"] }
        : ({} as never),
      { skip: !autoGenCollection },
    );

  const dashboards = dashboardItems?.data ?? [];
  const lastDashboard =
    dashboards.length > 0 ? dashboards[dashboards.length - 1] : null;

  return {
    lastDashboard,
    isLoading: isLoadingRoot || isLoadingDashboards,
  };
};

export const useMoveXrayDashboardToSharedCollection = () => {
  const dispatch = useDispatch();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [isMoving, setIsMoving] = useState(false);

  const moveDashboard = useCallback(
    async (
      dashboardId: number,
      targetCollectionId: CollectionId,
    ): Promise<void> => {
      setIsMoving(true);
      try {
        await updateDashboard({
          id: dashboardId,
          collection_id: targetCollectionId,
        }).unwrap();

        dispatch(Api.util.invalidateTags([listTag("embedding-hub-checklist")]));
      } finally {
        setIsMoving(false);
      }
    },
    [updateDashboard, dispatch],
  );

  return { moveDashboard, isMoving };
};
