import type { ChannelApiResponse, ChannelSpec } from "metabase-types/api";
import {
  createMockChannel,
  createMockDashboardSubscription,
} from "metabase-types/api/mocks";

import { getEditableSubscriptionChannel } from "./subscription-editing";

const createChannelSpec = (opts: Partial<ChannelSpec>): ChannelSpec => ({
  type: "email",
  name: "Email",
  schedules: ["hourly", "daily", "weekly", "monthly"],
  schedule_type: "hourly",
  allows_recipients: true,
  configured: true,
  ...opts,
});

const CONFIGURED_CHANNELS: ChannelApiResponse = {
  channels: {
    email: { ...createChannelSpec({ type: "email" }), recipients: ["user"] },
    slack: { ...createChannelSpec({ type: "slack" }), fields: [] },
    http: createChannelSpec({ type: "http" }),
  },
};

const UNCONFIGURED_CHANNELS: ChannelApiResponse = {
  channels: {
    email: {
      ...createChannelSpec({ type: "email", configured: false }),
      recipients: ["user"],
    },
    slack: {
      ...createChannelSpec({ type: "slack", configured: false }),
      fields: [],
    },
  },
};

describe("getEditableSubscriptionChannel", () => {
  it("returns the first channel when the dashboard can edit it", () => {
    const channel = createMockChannel({ channel_type: "slack" });
    expect(
      getEditableSubscriptionChannel(
        createMockDashboardSubscription({ channels: [channel] }),
        CONFIGURED_CHANNELS,
      ),
    ).toBe(channel);
  });

  it.each([CONFIGURED_CHANNELS, UNCONFIGURED_CHANNELS])(
    "returns an email or Slack channel the form input lists, set up or not",
    (channelInfo) => {
      const email = createMockChannel({ channel_type: "email" });
      const slack = createMockChannel({ channel_type: "slack" });
      expect(
        getEditableSubscriptionChannel(
          createMockDashboardSubscription({ channels: [email] }),
          channelInfo,
        ),
      ).toBe(email);
      expect(
        getEditableSubscriptionChannel(
          createMockDashboardSubscription({ channels: [slack] }),
          channelInfo,
        ),
      ).toBe(slack);
    },
  );

  it("returns null for a channel the form input leaves out", () => {
    expect(
      getEditableSubscriptionChannel(
        createMockDashboardSubscription({
          channels: [createMockChannel({ channel_type: "email" })],
        }),
        { channels: {} },
      ),
    ).toBeNull();
  });

  it("returns null for a webhook, even when it is configured", () => {
    expect(
      getEditableSubscriptionChannel(
        createMockDashboardSubscription({
          channels: [createMockChannel({ channel_type: "http" })],
        }),
        CONFIGURED_CHANNELS,
      ),
    ).toBeNull();
  });

  it("returns null for a subscription without a channel", () => {
    expect(
      getEditableSubscriptionChannel(
        createMockDashboardSubscription({ channels: [] }),
        CONFIGURED_CHANNELS,
      ),
    ).toBeNull();
  });
});
