import {
  createDashboardPublicLink,
  deleteDashboardPublicLink,
} from "metabase/api";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAction, createThunkAction } from "metabase/lib/redux";
import { DashboardApi } from "metabase/services";
import type { DashboardId } from "metabase-types/api";
import type { Dispatch, EmbedOptions } from "metabase-types/store";

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
export const createPublicLink = createThunkAction(
  CREATE_PUBLIC_LINK,
  ({ id }: DashboardIdPayload) =>
    async (dispatch: Dispatch) => {
      const { data } = await (dispatch(
        createDashboardPublicLink.initiate({
          id,
        }),
      ) as Promise<{ data: { uuid: string }; error: unknown }>);

      return { id, uuid: data.uuid };
    },
);

export const DELETE_PUBLIC_LINK = "metabase/dashboard/DELETE_PUBLIC_LINK";
export const deletePublicLink = createThunkAction(
  DELETE_PUBLIC_LINK,
  ({ id }: DashboardIdPayload) =>
    async (dispatch: Dispatch) => {
      await dispatch(
        deleteDashboardPublicLink.initiate({
          id,
        }),
      );

      return { id };
    },
);
