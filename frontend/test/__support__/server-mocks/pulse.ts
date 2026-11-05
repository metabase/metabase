import fetchMock from "fetch-mock";

import type { DeepPartial } from "metabase/embedding-sdk/types/utils";
import type {
  ChannelApiResponse,
  DashboardId,
  DashboardSubscription,
  UnsubscribeResponse,
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

export const setupUnsubscribeFromPulseEndpoint = (
  response: UnsubscribeResponse,
) => {
  fetchMock.post("path:/api/pulse/unsubscribe", response);
};

export const setupSubscriptionEndpoint = (
  subscription: DashboardSubscription,
) => {
  fetchMock.get(`path:/api/pulse/${subscription.id}`, subscription);
};

export const setupUpdateSubscriptionEndpoint = (
  subscription: DashboardSubscription,
  response: object | number = subscription,
) => {
  fetchMock.put(`path:/api/pulse/${subscription.id}`, response);
};

export const setupUnsubscribeFromSubscriptionEndpoint = (
  subscription: DashboardSubscription,
  response: object | number = 204,
) => {
  fetchMock.delete(`path:/api/pulse/${subscription.id}/subscription`, response);
};
