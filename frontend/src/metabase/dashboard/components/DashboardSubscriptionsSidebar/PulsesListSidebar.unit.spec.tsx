import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { Channel, ChannelApiResponse } from "metabase-types/api";
import {
  createMockChannel,
  createMockDashboardSubscription,
  createMockUser,
} from "metabase-types/api/mocks";

import { PulsesListSidebar } from "./PulsesListSidebar";

const UNCONFIGURED_EMAIL: ChannelApiResponse = {
  channels: {
    email: {
      type: "email",
      name: "Email",
      schedules: ["hourly", "daily", "weekly", "monthly"],
      schedule_type: "hourly",
      allows_recipients: true,
      configured: false,
      recipients: ["user", "email"],
    },
  },
};

type SetupOpts = {
  channel: Channel;
  formInput?: ChannelApiResponse;
};

describe("PulsesListSidebar", () => {
  const setup = ({ channel, formInput = { channels: {} } }: SetupOpts) => {
    const pulse = createMockDashboardSubscription({
      id: 1,
      channels: [channel],
    });
    const editPulse = jest.fn();

    renderWithProviders(
      <PulsesListSidebar
        pulses={[pulse]}
        formInput={formInput}
        createSubscription={jest.fn()}
        onCancel={jest.fn()}
        editPulse={editPulse}
      />,
    );

    return { pulse, editPulse };
  };

  const recipient = createMockUser({ common_name: "Ada Lovelace" });

  it("shows the custom subject of an email subscription", () => {
    setup({
      channel: createMockChannel({
        recipients: [recipient],
        details: { subject: "Weekly revenue" },
      }),
    });

    expect(screen.getByText("Weekly revenue")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("shows only the recipients when no subject is set", () => {
    setup({ channel: createMockChannel({ recipients: [recipient] }) });

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("listitem")).toHaveTextContent("Ada Lovelace");
  });

  it("says how and when each subscription sends", () => {
    setup({
      channel: createMockChannel({
        channel_type: "slack",
        details: { channel: "#sales" },
        schedule_type: "weekly",
        schedule_day: "mon",
        schedule_hour: 9,
      }),
    });

    expect(screen.getByText("Sent to #sales Monday at 9:00 AM")).toBeVisible();
  });

  it("opens the edit form of an email subscription whose channel is not configured", async () => {
    const channel = createMockChannel({
      schedule_type: "daily",
      schedule_hour: 8,
    });
    const { pulse, editPulse } = setup({
      channel,
      formInput: UNCONFIGURED_EMAIL,
    });

    await userEvent.click(screen.getByText("Emailed daily at 8:00 AM"));

    expect(editPulse).toHaveBeenCalledTimes(1);
    expect(editPulse).toHaveBeenCalledWith(pulse, "email");
  });

  it("does not open an edit form for a channel the form input leaves out", async () => {
    const { editPulse } = setup({
      channel: createMockChannel({ schedule_type: "hourly" }),
    });

    await userEvent.click(screen.getByText("Emailed hourly"));

    expect(editPulse).not.toHaveBeenCalled();
  });
});
