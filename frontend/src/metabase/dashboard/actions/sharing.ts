import {
  createDashboardPublicLink,
  deleteDashboardPublicLink,
} from "metabase/api";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import { createAsyncThunk } from "metabase/lib/redux";
import type { DashboardId } from "metabase-types/api";
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

export const CREATE_PUBLIC_LINK = "metabase/dashboard/CREATE_PUBLIC_LINK";
export const createPublicLink = createAsyncThunk(
  CREATE_PUBLIC_LINK,
  async ({ id }: DashboardIdPayload, { dispatch }) => {
    const { data = null } = await dispatch(
      createDashboardPublicLink.initiate({ id }),
    );
    return { id, uuid: data?.uuid };
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
