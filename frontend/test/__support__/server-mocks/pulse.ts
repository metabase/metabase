import fetchMock from "fetch-mock";

import type { DeepPartial } from "metabase/embedding-sdk/types/utils";
import type {
  ChannelApiResponse,
  DashboardId,
  DashboardSubscription,
} from "metabase-types/api";

export const setupNotificationChannelsEndpoints = (
  channelData: DeepPartial<Required<ChannelApiResponse["channels"]>>,
) => {
  fetchMock.get("path:/api/pulse/form_input", { channels: channelData });
};

export const setupListSubscriptionsEndpoint = (
  subscriptions: DashboardSubscription[],
  { dashboardId }: { dashboardId?: DashboardId } = {},
) => {
  fetchMock.get({
    url: "path:/api/pulse",
    ...(dashboardId != null && { query: { dashboard_id: dashboardId } }),
    response: subscriptions,
  });
};

export const setupNotificationChannelsEndpointError = () => {
  fetchMock.get("path:/api/pulse/form_input", 500);
};
