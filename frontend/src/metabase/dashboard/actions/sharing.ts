import { subscriptionApi } from "metabase/api";
import { runRtkEndpoint } from "metabase/api/utils/run-rtk-endpoint";
import { canManageSubscriptions } from "metabase/current-user";
import { SIDEBAR_NAME } from "metabase/dashboard/constants";
import type { Dispatch, GetState } from "metabase/redux/store";
import type { Dashboard, DashboardSubscription } from "metabase-types/api";

import { getCanManageDashboardSubscriptions, getIsSharing } from "../selectors";

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

export const editSubscriptionInSidebar = (
  subscriptionId: DashboardSubscription["id"],
) =>
  setSidebar({
    name: SIDEBAR_NAME.sharing,
    props: { subscriptionId },
  });

/**
 * Opens the subscriptions sidebar, on the edit form of `subscriptionId` when
 * there is one, if the user can manage the dashboard's subscriptions.
 */
export const openSubscriptionsSidebarIfAllowed =
  (
    dashboard: Pick<Dashboard, "dashcards">,
    subscriptionId: DashboardSubscription["id"] | undefined,
  ) =>
  async (dispatch: Dispatch, getState: GetState) => {
    if (canManageSubscriptions(getState())) {
      try {
        await runRtkEndpoint(
          undefined,
          dispatch,
          subscriptionApi.endpoints.getChannelInfo,
          { forceRefetch: false },
        );
      } catch {
        // Without channel info, only an admin can manage subscriptions
      }
    }
    const state = getState();
    const { data: channelInfo } =
      subscriptionApi.endpoints.getChannelInfo.select()(state);
    if (!getCanManageDashboardSubscriptions(state, dashboard, channelInfo)) {
      return;
    }
    dispatch(
      subscriptionId != null
        ? editSubscriptionInSidebar(subscriptionId)
        : setSharing(true),
    );
  };

/** Keeps the subscriptions sidebar open and drops the subscription it was asked to edit. */
export const clearRequestedSubscription = () =>
  setSidebar({ name: SIDEBAR_NAME.sharing });

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
