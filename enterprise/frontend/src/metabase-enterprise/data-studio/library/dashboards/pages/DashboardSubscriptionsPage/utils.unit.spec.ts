import {
  createMockChannel,
  createMockDashboardSubscription,
  createMockParameter,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  filterSubscriptionRows,
  formatChannelSchedule,
  getSubscriptionRows,
} from "./utils";

const CATEGORY_PARAMETER = createMockParameter({
  id: "1",
  name: "Category",
  slug: "category",
  type: "string/=",
});

const EMAIL_SUBSCRIPTION = createMockDashboardSubscription({
  id: 1,
  creator: createMockUser({ common_name: "Bobby Tables" }),
  channels: [
    createMockChannel({
      schedule_type: "hourly",
      recipients: [
        createMockUser({
          common_name: "Ada Lovelace",
          email: "ada@example.com",
        }),
        { email: "ext@partner.com" },
      ],
    }),
  ],
  parameters: [createMockParameter({ id: "1", value: "Gizmo" })],
});

const SLACK_SUBSCRIPTION = createMockDashboardSubscription({
  id: 2,
  creator: createMockUser({ common_name: "Grace Hopper" }),
  channels: [
    createMockChannel({
      channel_type: "slack",
      schedule_type: "daily",
      schedule_hour: 8,
      details: { channel: "#sales" },
    }),
  ],
});

describe("getSubscriptionRows", () => {
  it("formats a row per subscription", () => {
    expect(
      getSubscriptionRows(
        [EMAIL_SUBSCRIPTION, SLACK_SUBSCRIPTION],
        [CATEGORY_PARAMETER],
      ),
    ).toEqual([
      {
        id: 1,
        channelType: "email",
        schedule: "Hourly",
        recipients: "Ada Lovelace and 1 other",
        recipientSearchTerms: [
          "Ada Lovelace",
          "ada@example.com",
          "ext@partner.com",
        ],
        filters: "Category: Gizmo",
        creatorName: "Bobby Tables",
      },
      {
        id: 2,
        channelType: "slack",
        schedule: "Daily at 8:00 AM",
        recipients: "#sales",
        recipientSearchTerms: [],
        filters: "",
        creatorName: "Grace Hopper",
      },
    ]);
  });

  it("skips a subscription without a channel", () => {
    expect(
      getSubscriptionRows(
        [createMockDashboardSubscription({ channels: [] })],
        [],
      ),
    ).toEqual([]);
  });
});

describe("filterSubscriptionRows", () => {
  const rows = getSubscriptionRows(
    [EMAIL_SUBSCRIPTION, SLACK_SUBSCRIPTION],
    [CATEGORY_PARAMETER],
  );

  it("matches any column case-insensitively", () => {
    expect(filterSubscriptionRows(rows, " HOPPER ")).toEqual([rows[1]]);
    expect(filterSubscriptionRows(rows, "gizmo")).toEqual([rows[0]]);
  });

  it("matches any recipient's name or address, not only the first", () => {
    expect(filterSubscriptionRows(rows, "partner.com")).toEqual([rows[0]]);
    expect(filterSubscriptionRows(rows, "ada@")).toEqual([rows[0]]);
    expect(filterSubscriptionRows(rows, "#sales")).toEqual([rows[1]]);
  });

  it("returns every row for a blank query", () => {
    expect(filterSubscriptionRows(rows, "  ")).toEqual(rows);
  });
});

describe("formatChannelSchedule", () => {
  it("adds the timezone to a schedule with a send time", () => {
    const channel = createMockChannel({
      schedule_type: "daily",
      schedule_hour: 8,
    });

    expect(formatChannelSchedule(channel, "PST")).toBe("Daily at 8:00 AM PST");
  });

  it("leaves the timezone off a schedule without a send time", () => {
    const channel = createMockChannel({
      schedule_type: "daily",
      schedule_hour: null,
    });

    expect(formatChannelSchedule(channel, "PST")).toBe("Schedule not set");
  });
});
