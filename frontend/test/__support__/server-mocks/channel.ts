import fetchMock from "fetch-mock";

import type { NotificationChannel } from "metabase-types/api";

export const setupWebhookChannelsEndpoints = (
  channels: NotificationChannel[] = [],
) => {
  fetchMock.get("path:/api/channel", channels);
};
