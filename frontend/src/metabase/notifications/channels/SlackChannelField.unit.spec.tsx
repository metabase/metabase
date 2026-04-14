import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen } from "__support__/ui";
import { SlackChannelField } from "metabase/notifications/channels/SlackChannelField";
import type {
  Channel,
  ChannelSpec,
  SlackChannelOption,
} from "metabase-types/api";

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

type OnChannelPropertyChange = (
  key: string,
  value: Record<string, string | boolean>,
) => void;

function StatefulWrapper({
  initialChannel,
  spy,
}: {
  initialChannel: Channel;
  spy: jest.MockedFunction<OnChannelPropertyChange>;
}) {
  const [channel, setChannel] = useState(initialChannel);
  const onChannelPropertyChange: OnChannelPropertyChange = (prop, value) => {
    spy(prop, value);
    if (prop === "details") {
      setChannel((prev) => ({ ...prev, details: value }));
    }
  };
  return (
    <SlackChannelField
      channel={channel}
      channelSpec={CHANNEL_SPEC}
      onChannelPropertyChange={onChannelPropertyChange}
    />
  );
}

function setup({ channel }: { channel: Channel }) {
  const spy = jest.fn<
    ReturnType<OnChannelPropertyChange>,
    Parameters<OnChannelPropertyChange>
  >();
  renderWithProviders(<StatefulWrapper initialChannel={channel} spy={spy} />);
  return { spy };
}

describe("SlackChannelField stale channel_id prevention", () => {
  it("does not carry over old channel_id when user changes to a different known channel", async () => {
    const { spy } = setup({
      channel: {
        channel_type: "slack",
        details: { channel: "#general", channel_id: "C001" },
      },
    });

    const input = screen.getByPlaceholderText("Pick a user or channel...");
    await userEvent.clear(input);
    await userEvent.type(input, "#random");

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    const [propName, details] = lastCall;
    expect(propName).toBe("details");
    expect(details.channel).toBe("#random");
    expect(details.channel_id).toBe("C002");
  });

  it("strips channel_id when user types an unknown channel name", async () => {
    const { spy } = setup({
      channel: {
        channel_type: "slack",
        details: { channel: "#general", channel_id: "C001" },
      },
    });

    const input = screen.getByPlaceholderText("Pick a user or channel...");
    await userEvent.clear(input);
    await userEvent.type(input, "#private-stuff");

    const lastCall = spy.mock.calls[spy.mock.calls.length - 1];
    const [propName, details] = lastCall;
    expect(propName).toBe("details");
    expect(details.channel).toBe("#private-stuff");
    expect(details).not.toHaveProperty("channel_id");
  });
});
