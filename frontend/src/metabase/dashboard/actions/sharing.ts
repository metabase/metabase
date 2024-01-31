import type { Dashboard, DashboardId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";
import { createAction, createThunkAction } from "metabase/lib/redux";

import { SIDEBAR_NAME } from "metabase/dashboard/constants";

import { DashboardApi } from "metabase/services";

import type { EmbeddingParameters } from "metabase/public/lib/types";
import { setSidebar, closeSidebar } from "./ui";

type DashboardIdPayload = {
  id: DashboardId;
};

type PublishEmbeddingPayload = {
  id: DashboardId;
  enable_embedding: boolean;
  embedding_params: EmbeddingParameters;
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

export const PUBLISH_EMBEDDING = "metabase/dashboard/PUBLISH_EMBEDDING";
export const publishEmbedding = createThunkAction(
  PUBLISH_EMBEDDING,
  ({ id, enable_embedding, embedding_params }: PublishEmbeddingPayload) =>
    async () => {
      const result = await DashboardApi.update({
        id,
        enable_embedding,
        embedding_params,
      });

      return {
        id,
        enable_embedding: result.enable_embedding,
        embedding_params: result.embedding_params,
      };
    },
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
