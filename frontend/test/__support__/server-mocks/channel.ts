import fetchMock from "fetch-mock";

import type { NotificationChannel } from "metabase-types/api";

export const setupWebhookChannelsEndpoint = (
  channels: NotificationChannel[] = [],
) => {
  fetchMock.get("path:/api/channel", channels);
};

type ChannelTestErrorData = {
  "request-status": number;
  "request-body": string;
};

/**
 * Mocks POST /api/channel/test. With `errorData`, it responds 400 in the
 * shape the backend uses to forward a failed webhook response.
 */
export const setupTestChannelEndpoint = ({
  errorData,
}: { errorData?: ChannelTestErrorData } = {}) => {
  const name = "channel-test";
  fetchMock.removeRoute(name);
  fetchMock.post(
    "path:/api/channel/test",
    errorData
      ? {
          status: 400,
          body: { message: "Webhook request failed", data: errorData },
        }
      : { ok: true },
    { name },
  );
};

/**
 * Stateful channel mocks for create-then-read tests: POST /api/channel and
 * PUT /api/channel/:id change a shared store that GET /api/channel returns.
 * A PUT with `active: false` removes the channel from the list.
 */
export const setupStatefulChannelEndpoints = ({
  channels = [],
}: { channels?: NotificationChannel[] } = {}) => {
  const store = new Map(channels.map((channel) => [channel.id, channel]));

  fetchMock.removeRoute("list-channels");
  fetchMock.get("path:/api/channel", () => [...store.values()], {
    name: "list-channels",
  });

  fetchMock.removeRoute("create-channel");
  fetchMock.post(
    "path:/api/channel",
    ({ options }) => {
      const body: Omit<
        NotificationChannel,
        "id" | "active" | "created_at" | "updated_at"
      > = JSON.parse(String(options.body));
      const id = Math.max(0, ...store.keys()) + 1;
      const channel: NotificationChannel = {
        ...body,
        id,
        active: true,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      };
      store.set(id, channel);
      return channel;
    },
    { name: "create-channel" },
  );

  fetchMock.removeRoute("update-channel");
  fetchMock.put(
    /\/api\/channel\/\d+$/,
    ({ url, options }) => {
      const id = Number(url.split("/").at(-1));
      const existing = store.get(id);
      if (!existing) {
        return 404;
      }
      const changes: Partial<NotificationChannel> = JSON.parse(
        String(options.body),
      );
      const channel = { ...existing, ...changes };
      if (channel.active) {
        store.set(id, channel);
      } else {
        store.delete(id);
      }
      return channel;
    },
    { name: "update-channel" },
  );
};
