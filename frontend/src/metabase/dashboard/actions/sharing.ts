import { dashboardApi } from "metabase/api";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import Dashboards from "metabase/entities/dashboards";
import { createAction, createAsyncThunk } from "metabase/lib/redux";
import type { Dashboard, DashboardId } from "metabase-types/api";
import type { Dispatch, EmbedOptions } from "metabase-types/store";

import { setSidebar, closeSidebar } from "./ui";

type DashboardIdPayload = {
  id: DashboardId;
};

export const setSharing = (isSharing: boolean) => (dispatch: Dispatch) => {
  if (isSharing) {
    dispatch(
      setSidebar({
        name: SIDEBAR_NAME.sharing,
      }),
    );
  } else {
    dispatch(closeSidebar());
  }
};

export const UPDATE_ENABLE_EMBEDDING =
  "metabase/dashboard/UPDATE_ENABLE_EMBEDDING";
export const updateEnableEmbedding = createAction(
  UPDATE_ENABLE_EMBEDDING,
  ({ id }: DashboardIdPayload, enable_embedding: boolean) =>
    Dashboards.actions.update({
      id,
      enable_embedding,
    }),
);

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }: DashboardIdPayload, embedding_params: EmbedOptions) =>
    Dashboards.actions.update({ id, embedding_params }),
);

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAsyncThunk(
  CREATE_PUBLIC_LINK,
  async (
    { id }: DashboardIdPayload,
    { dispatch },
  ): Promise<{
    id: DashboardId;
    uuid: Dashboard["public_uuid"];
  }> => {
    const { uuid } = await dispatch(
      dashboardApi.endpoints.createPublicDashboardLink.initiate(id),
    ).unwrap();
    return { id, uuid };
  },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAsyncThunk(
  DELETE_PUBLIC_LINK,
  async (
    { id }: DashboardIdPayload,
    { dispatch },
  ): Promise<DashboardIdPayload> => {
    await dispatch(
      dashboardApi.endpoints.deletePublicDashboardLink.initiate(id),
    ).unwrap();
    return { id };
  },
);
