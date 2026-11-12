import { skipToken, useGetChannelInfoQuery } from "metabase/api";
import { canManageSubscriptions } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import type { Dashboard } from "metabase-types/api";

import { getCanManageDashboardSubscriptions } from "../selectors";

/**
 * Whether the current user can set up and edit this dashboard's
 * subscriptions, by `getCanManageDashboardSubscriptions`. `false` while the
 * channel setup loads for a non-admin.
 */
export function useCanManageDashboardSubscriptions(
  dashboard: Pick<Dashboard, "dashcards"> | null | undefined,
): boolean {
  const hasSubscriptionsPermission = useSelector(canManageSubscriptions);
  // Skip the request when the user can't manage subscriptions, as it fails
  // for them anyway (EMB-967)
  const { data: channelInfo } = useGetChannelInfoQuery(
    hasSubscriptionsPermission ? undefined : skipToken,
  );

  return useSelector(
    (state) =>
      dashboard != null &&
      getCanManageDashboardSubscriptions(state, dashboard, channelInfo),
  );
}
