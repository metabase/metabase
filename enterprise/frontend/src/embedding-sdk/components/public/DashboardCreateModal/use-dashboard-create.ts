import { useCallback } from "react";

import { useSdkDispatch } from "embedding-sdk/store";
import type { CreateDashboardProperties } from "metabase/dashboard/containers/CreateDashboardForm";
import Collections from "metabase/entities/collections";
import Dashboards from "metabase/entities/dashboards";
import { useStore } from "metabase/lib/redux";
import type { CollectionId } from "metabase-types/api";

export interface DashboardCreateParameters
  extends Omit<CreateDashboardProperties, "collection_id"> {
  collection_id: CollectionId | null;
}

export const useDashboardCreate = () => {
  const dispatch = useSdkDispatch();
  const store = useStore();

  const createDashboard = useCallback(
    async (values: DashboardCreateParameters) => {
      const initialCollectionId = Collections.selectors.getInitialCollectionId(
        store.getState(),
        values,
      ) as CollectionId;

      const action = await dispatch(
        Dashboards.actions.create({
          ...values,
          collection_id: values.collection_id ?? initialCollectionId,
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
