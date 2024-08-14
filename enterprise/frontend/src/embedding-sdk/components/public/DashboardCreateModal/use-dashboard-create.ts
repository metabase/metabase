import { useCallback } from "react";

import { useSdkDispatch, useSdkStore } from "embedding-sdk/store";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import type { CollectionId } from "metabase-types/api";

export interface DashboardCreateParameters
  extends Omit<CreateDashboardProperties, "collection_id"> {
  collectionId: CollectionId | null;
}

export const useDashboardCreate = () => {
  const store = useSdkStore();
  const dispatch = useSdkDispatch();

  const createDashboard = useCallback(
    async (values: DashboardCreateParameters) => {
      const initialCollectionId = Collections.selectors.getInitialCollectionId(
        store.getState(),
        values,
      ) as CollectionId;

      const action = await dispatch(
        Dashboards.actions.create({
          ...values,
          collection_id: values.collectionId ?? initialCollectionId,
        }),
      );
      const dashboard = Dashboards.HACK_getObjectFromAction(action);

      return dashboard;
    },
    [dispatch, store],
  );

  return {
    createDashboard,
  };
};
