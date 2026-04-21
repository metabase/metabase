import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Api,
  skipToken,
  useCreateDashboardMutation,
  useListCollectionItemsQuery,
  useUpdateDashboardMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import {
  createDashCard,
  createVirtualCard,
} from "metabase/common/utils/dashboard";
import { useDispatch } from "metabase/utils/redux";
import type {
  CollectionId,
  CollectionItem,
  DashboardCard,
} from "metabase-types/api";

// This name is hardcoded in the backend (see xrays/automagic_dashboards/populate.clj).
// There is no special collection type — the name is the canonical identifier.
const AUTO_GENERATED_DASHBOARDS_COLLECTION_NAME =
  "Automatically Generated Dashboards";

/**
 * Returns the most recently edited dashboard from the
 * "Automatically Generated Dashboards" collection, useful for pre-filling
 * the dashboard picker.
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
        ? {
            id: autoGenCollection.id,
            models: ["dashboard"],
            sort_column: "last_edited_at",
            sort_direction: "desc",
          }
        : skipToken,
    );

  const dashboards = dashboardItems?.data ?? [];
  const lastDashboard = dashboards.length > 0 ? dashboards[0] : null;

  return {
    lastDashboard,
    isLoading: isLoadingRoot || isLoadingDashboards,
  };
};

export const useMoveXrayDashboardToSharedCollection = () => {
  const dispatch = useDispatch();
  const [updateDashboard, { isLoading: isMoving }] =
    useUpdateDashboardMutation();

  const moveDashboard = useCallback(
    async (
      dashboardId: number,
      targetCollectionId: CollectionId,
    ): Promise<void> => {
      await updateDashboard({
        id: dashboardId,
        collection_id: targetCollectionId,
      }).unwrap();

      dispatch(Api.util.invalidateTags([listTag("embedding-hub-checklist")]));
    },
    [updateDashboard, dispatch],
  );

  return { moveDashboard, isMoving };
};

export const useCreateSampleDashboardInSharedCollection = () => {
  const dispatch = useDispatch();
  const [createDashboard] = useCreateDashboardMutation();
  const [updateDashboard] = useUpdateDashboardMutation();
  const [isCreating, setIsCreating] = useState(false);

  const createSampleDashboard = useCallback(
    async (targetCollectionId: CollectionId): Promise<void> => {
      setIsCreating(true);
      try {
        const dashboard = await createDashboard({
          name: t`Sample dashboard`,
          collection_id: targetCollectionId,
        }).unwrap();

        const virtualCard = createVirtualCard("text");
        const dashcard = createDashCard({
          dashboard_id: dashboard.id,
          card: virtualCard,
          row: 0,
          col: 0,
          size_x: 18,
          size_y: 2,
          visualization_settings: {
            virtual_card: virtualCard,
            text: t`Hello, world!`,
          },
        });

        await updateDashboard({
          id: dashboard.id,
          dashcards: [dashcard as DashboardCard],
        }).unwrap();

        dispatch(Api.util.invalidateTags([listTag("embedding-hub-checklist")]));
      } finally {
        setIsCreating(false);
      }
    },
    [createDashboard, updateDashboard, dispatch],
  );

  return { createSampleDashboard, isCreating };
};
