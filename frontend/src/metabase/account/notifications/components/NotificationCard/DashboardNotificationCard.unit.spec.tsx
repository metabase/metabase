import { fireEvent, render, screen } from "__support__/ui";
import type { DashboardSubscriptionListItem } from "metabase/account/notifications/types";
import type { Channel } from "metabase-types/api";
import {
  createMockChannel,
  createMockDashboardSubscription,
  createMockUser,
} from "metabase-types/api/mocks";

import { DashboardNotificationCard } from "./DashboardNotificationCard";

const getPulseItem = ({
  creator = getUser(),
  channels = [getChannel()],
} = {}): DashboardSubscriptionListItem => ({
  item: createMockDashboardSubscription({
    creator,
    channels,
    created_at: "2021-05-08T02:02:07.441Z",
  }),
  type: "pulse",
});

const getUser = ({ id = 1 } = {}) =>
  createMockUser({
    id,
    common_name: "John Doe",
  });

const getChannel = ({
  channel_type = "email",
  schedule_type = "hourly",
  recipients = [],
}: Partial<Channel> = {}) =>
  createMockChannel({
    channel_type,
    schedule_type,
    recipients,
    schedule_hour: 8,
    schedule_day: "mon",
    schedule_frame: "first",
    details: {
      channel: "@channel",
    },
  });

describe("DashboardNotificationCard", () => {
  it("should render a pulse", () => {
    const pulse = getPulseItem();
    const user = getUser();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Pulse")).toBeInTheDocument();
    expect(screen.getByText("Emailed hourly")).toBeInTheDocument();
    expect(
      screen.getByText("Created by you on May 8, 2021"),
    ).toBeInTheDocument();
  });

  it("should render a slack pulse", () => {
    const pulse = getPulseItem({
      channels: [getChannel({ channel_type: "slack" })],
    });
    const user = getUser();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Slack’d hourly to @channel")).toBeInTheDocument();
  });

  it("should render a daily pulse", () => {
    const pulse = getPulseItem({
      channels: [getChannel({ schedule_type: "daily" })],
    });
    const user = getUser();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Emailed daily at 8:00 AM")).toBeInTheDocument();
  });

  it("should render a weekly pulse", () => {
    const pulse = getPulseItem({
      channels: [getChannel({ schedule_type: "weekly" })],
    });
    const user = getUser();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(screen.getByText("Emailed Monday at 8:00 AM")).toBeInTheDocument();
  });

  it("should render a monthly pulse", () => {
    const pulse = getPulseItem({
      channels: [getChannel({ schedule_type: "monthly" })],
    });
    const user = getUser();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Emailed monthly on the first Monday at 8:00 AM"),
    ).toBeInTheDocument();
  });

  it("should render an pulse created by another user", () => {
    const pulse = getPulseItem();
    const user = getUser({ id: 2 });

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onArchive={jest.fn()}
        onUnsubscribe={jest.fn()}
      />,
    );

    expect(
      screen.getByText("Created by John Doe on May 8, 2021"),
    ).toBeInTheDocument();
  });

  it("should unsubscribe when the user is not the creator and subscribed", () => {
    const creator = getUser({ id: 1 });
    const user = getUser({ id: 2 });
    const pulse = getPulseItem({
      creator,
      channels: [getChannel({ recipients: [user] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={user}
        isEditable
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(pulse);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should unsubscribe when user user is the creator and subscribed with another user", () => {
    const creator = getUser({ id: 1 });
    const recipient = getUser({ id: 2 });
    const pulse = getPulseItem({
      creator,
      channels: [getChannel({ recipients: [creator, recipient] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).toHaveBeenCalledWith(pulse);
    expect(onArchive).not.toHaveBeenCalled();
  });

  it("should hide archive button when not editable", () => {
    const creator = getUser();
    const pulse = getPulseItem({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable={false}
      />,
    );

    expect(screen.queryByLabelText("close icon")).not.toBeInTheDocument();
  });

  it("should archive when the user is the creator and not subscribed", () => {
    const creator = getUser();
    const pulse = getPulseItem({ creator });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(pulse);
  });

  it("should archive when the user is the creator and is the only one subscribed", () => {
    const creator = getUser();
    const pulse = getPulseItem({
      creator,
      channels: [getChannel({ recipients: [creator] })],
    });
    const onUnsubscribe = jest.fn();
    const onArchive = jest.fn();

    render(
      <DashboardNotificationCard
        listItem={pulse}
        user={creator}
        onUnsubscribe={onUnsubscribe}
        onArchive={onArchive}
        isEditable
      />,
    );

    fireEvent.click(screen.getByLabelText("close icon"));
    expect(onUnsubscribe).not.toHaveBeenCalled();
    expect(onArchive).toHaveBeenCalledWith(pulse);
  });
});
