import { createAction } from "metabase/lib/redux";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import { DashboardApi } from "metabase/services";

import { setSidebar, closeSidebar } from "./ui";

export const setSharing = isSharing => dispatch => {
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
  ({ id }, enable_embedding) => DashboardApi.update({ id, enable_embedding }),
);

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }, embedding_params) => DashboardApi.update({ id, embedding_params }),
);

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAction(
  CREATE_PUBLIC_LINK,
  async ({ id }) => {
    const { uuid } = await DashboardApi.createPublicLink({ id });
    return { id, uuid };
  },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(
  DELETE_PUBLIC_LINK,
  async ({ id }) => {
    await DashboardApi.deletePublicLink({ id });
    return { id };
  },
);
