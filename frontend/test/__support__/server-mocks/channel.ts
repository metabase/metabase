import fetchMock from "fetch-mock";

import type { NotificationChannel } from "metabase-types/api";

export const setupWebhookChannelsEndpoint = (
  channels: NotificationChannel[] = [],
) => {
  fetchMock.get("path:/api/channel", channels);
};
