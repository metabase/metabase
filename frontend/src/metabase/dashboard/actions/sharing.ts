import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAction } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
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
    DashboardApi.update({
      id,
      enable_embedding,
    }),
);

export const UPDATE_EMBEDDING_PARAMS =
  "metabase/dashboard/UPDATE_EMBEDDING_PARAMS";
export const updateEmbeddingParams = createAction(
  UPDATE_EMBEDDING_PARAMS,
  ({ id }: DashboardIdPayload, embedding_params: EmbedOptions) =>
    DashboardApi.update({ id, embedding_params }),
);

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";

export const createPublicLink = createAction(
  CREATE_PUBLIC_LINK,
  async ({
    id,
  }: DashboardIdPayload): Promise<{
    id: DashboardId;
    uuid: Dashboard["public_uuid"];
  }> => {
    const { uuid } = await DashboardApi.createPublicLink({ id });
    return { id, uuid };
  },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createAction(
  DELETE_PUBLIC_LINK,
  async ({ id }: DashboardIdPayload): Promise<DashboardIdPayload> => {
    await DashboardApi.deletePublicLink({ id });
    return { id };
  },
);
