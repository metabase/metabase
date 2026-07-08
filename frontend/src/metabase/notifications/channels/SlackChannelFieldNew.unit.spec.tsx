import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { SlackChannelFieldNew } from "metabase/notifications/channels/SlackChannelFieldNew";
import type {
  ChannelSpec,
  NotificationHandlerSlack,
  SlackChannelOption,
} from "metabase-types/api";
import { createMockNotificationHandlerSlack } from "metabase-types/api/mocks";

type OnChange = ComponentProps<typeof SlackChannelFieldNew>["onChange"];

const SLACK_OPTIONS: SlackChannelOption[] = [
  { displayName: "#general", id: "C001" },
  { displayName: "#random", id: "C002" },
];

const CHANNEL_SPEC: ChannelSpec = {
  type: "slack",
  name: "Slack",
  schedules: ["hourly"],
  schedule_type: null,
  allows_recipients: false,
  configured: true,
  fields: [
    {
      name: "channel",
      displayName: "Post to",
      options: SLACK_OPTIONS,
      required: true,
    },
  ],
};

function StatefulWrapper({
  initialChannel,
  spy,
}: {
  initialChannel: NotificationHandlerSlack;
  spy: jest.MockedFunction<OnChange>;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const onChange: OnChange = (newConfig) => {
    spy(newConfig);
    setChannel(newConfig);
  };
  return (
    <SlackChannelFieldNew
      channel={channel}
      channelSpec={CHANNEL_SPEC}
      onChange={onChange}
    />
  );
}

function setup({
  channel = createMockNotificationHandlerSlack(),
}: { channel?: NotificationHandlerSlack } = {}) {
  const spy = jest.fn<ReturnType<OnChange>, Parameters<OnChange>>();
  renderWithProviders(<StatefulWrapper initialChannel={channel} spy={spy} />);
  return { spy };
}

function getLastDetails(spy: jest.MockedFunction<OnChange>) {
  const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
  const [handler] = lastCall;
  return handler.recipients[0]?.details;
}

describe("SlackChannelFieldNew channel_id storage", () => {
  it("stores channel_id when user selects a known channel", async () => {
    const { spy } = setup();

    const input = screen.getByPlaceholderText("Pick a user or channel...");
    await userEvent.type(input, "#general");

    const details = getLastDetails(spy);
    expect(details?.value).toBe("#general");
    expect(details?.channel_id).toBe("C001");
  });

  it("omits channel_id when user types an unknown channel name", async () => {
    const { spy } = setup();

    const input = screen.getByPlaceholderText("Pick a user or channel...");
    await userEvent.type(input, "#private-stuff");

    const details = getLastDetails(spy);
    expect(details?.value).toBe("#private-stuff");
    expect(details).not.toHaveProperty("channel_id");
  });

  it("updates channel_id when user switches from one known channel to another", async () => {
    const { spy } = setup({
      channel: createMockNotificationHandlerSlack({
        recipients: [
          {
            type: "notification-recipient/raw-value",
            details: { value: "#general", channel_id: "C001" },
          },
        ],
      }),
    });

    const input = screen.getByPlaceholderText("Pick a user or channel...");
    await userEvent.clear(input);
    await userEvent.type(input, "#random");

    const details = getLastDetails(spy);
    expect(details?.value).toBe("#random");
    expect(details?.channel_id).toBe("C002");
  });
});
