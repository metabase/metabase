import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import type { Dispatch, GetState } from "metabase-types/store";

import { getIsSharing } from "../selectors";

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

export const closeSidebarIfSubscriptionsSidebarOpen =
  () => (dispatch: Dispatch, getState: GetState) => {
    const state = getState();
    const isSharing = getIsSharing(state);
    if (isSharing) {
      dispatch(closeSidebar());
    }
  };

export const toggleSharing = () => (dispatch: Dispatch, getState: GetState) => {
  const state = getState();
  const isSharing = getIsSharing(state);
  dispatch(setSharing(!isSharing));
};
