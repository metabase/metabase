import { useCallback, useState } from "react";
import { t } from "ttag";

import {
  Api,
  useCreateDashboardMutation,
  useListCollectionItemsQuery,
  useUpdateDashboardMutation,
} from "metabase/api";
import { listTag } from "metabase/api/tags";
import { useDispatch } from "metabase/lib/redux";
import type { CollectionId, CollectionItem } from "metabase-types/api";

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
        : ({} as never),
      { skip: !autoGenCollection },
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

        await updateDashboard({
          id: dashboard.id,
          dashcards: [
            // @ts-expect-error — the API accepts partial dashcards for creation (id < 0),
            // but DashboardCard requires fields the server fills in (entity_id, created_at, etc.)
            {
              id: -1,
              card_id: null,
              row: 0,
              col: 0,
              size_x: 18,
              size_y: 2,
              visualization_settings: {
                virtual_card: {
                  name: null,
                  display: "text",
                  visualization_settings: {},
                  archived: false,
                },
                text: t`Hello, world!`,
              },
            },
          ],
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
