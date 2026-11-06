import { useListSubscriptionsQuery } from "metabase/api";
import { useParams } from "metabase/router";
import type { Dashboard } from "metabase-types/api";

import { getSubscriptionSelection } from "./utils";

/**
 * The dashboard's subscriptions and the one the URL selects. The selection is
 * `missing` while the list loads, so check `isLoading` before trusting it.
 */
export function useDashboardSubscriptions(dashboard: Dashboard) {
  const { subscriptionId } = useParams<{ subscriptionId?: string }>();
  const {
    data: subscriptions,
    isLoading,
    error,
  } = useListSubscriptionsQuery({ dashboard_id: dashboard.id });
  const selection = getSubscriptionSelection(
    subscriptions ?? [],
    subscriptionId,
  );

  return { subscriptions, isLoading, error, selection };
}
