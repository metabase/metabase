import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAsyncThunk } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
import type { Dashboard } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { closeSidebar, setSidebar } from "./ui";

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
export const updateEnableEmbedding = createAsyncThunk<
  Dashboard,
  Pick<Dashboard, "id" | "enable_embedding">
>(
  UPDATE_ENABLE_EMBEDDING,
  async ({ id, enable_embedding }) =>
    await DashboardApi.update({
      id,
      enable_embedding,
    }),
);

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAsyncThunk<
  Dashboard,
  Pick<Dashboard, "id" | "embedding_params">
>(
  UPDATE_EMBEDDING_PARAMS,
  async ({ id, embedding_params }) =>
    await DashboardApi.update({ id, embedding_params }),
);
