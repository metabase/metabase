import {
  createDashboardPublicLink,
  deleteDashboardPublicLink,
} from "metabase/api";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAsyncThunk } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
import type { Dashboard, DashboardId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { closeSidebar, setSidebar } from "./ui";

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
export const updateEnableEmbedding = createAsyncThunk<
  Dashboard,
  Pick<Dashboard, "id" | "enable_embedding">
>(UPDATE_ENABLE_EMBEDDING, async ({ id, enable_embedding }) => {
  const response = await DashboardApi.update({
    id,
    enable_embedding,
  });

  return response;
});

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAsyncThunk<
  Dashboard,
  Pick<Dashboard, "id" | "embedding_params">
>(UPDATE_EMBEDDING_PARAMS, async ({ id, embedding_params }) => {
  const response = await DashboardApi.update({ id, embedding_params });

  return response;
});

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAsyncThunk(
  CREATE_PUBLIC_LINK,
  async (
    { id }: DashboardIdPayload,
    { dispatch, fulfillWithValue, rejectWithValue },
  ) => {
    const { data, error } = await dispatch(
      createDashboardPublicLink.initiate({ id }),
    );

    if (!data || error) {
      return rejectWithValue(error);
    }

    return fulfillWithValue({ id, uuid: data.uuid });
  },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAsyncThunk(
  DELETE_PUBLIC_LINK,
  async ({ id }: DashboardIdPayload, { dispatch }) => {
    await dispatch(
      deleteDashboardPublicLink.initiate({
        id,
      }),
    );

    return { id };
  },
);
