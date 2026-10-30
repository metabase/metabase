import { mockSettings } from "__support__/settings";
import { createMockUiParameter } from "metabase-lib/v1/parameters/mock";
import type { Channel, ParameterValueOrArray } from "metabase-types/api";
import {
  createMockChannel,
  createMockDashboardSubscription,
  createMockParameter,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  buildFilterText,
  buildRecipientText,
  formatFilter,
  formatSubscriptionDelivery,
  formatSubscriptionSchedule,
  getActiveFilters,
  getChannelRecipients,
  getRecipientName,
} from "./subscription-formatting";

beforeEach(() => {
  jest.useFakeTimers({ now: new Date(2024, 5, 1) });
});

afterEach(() => {
  jest.useRealTimers();
});

describe("buildFilterText", () => {
  const stateParameter = createMockUiParameter({
    id: "1",
    name: "State",
    slug: "state",
    type: "string/=",
  });

  const buildPulse = (value: ParameterValueOrArray) =>
    createMockDashboardSubscription({
      parameters: [createMockParameter({ id: "1", value })],
    });

  it("returns an empty string when no parameters have values", () => {
    expect(
      buildFilterText(createMockDashboardSubscription(), [stateParameter]),
    ).toBe("");
  });

  it("renders a single value", () => {
    expect(buildFilterText(buildPulse("CA"), [stateParameter])).toBe(
      "State: CA",
    );
  });

  it("renders a single-element array value", () => {
    expect(buildFilterText(buildPulse(["CA"]), [stateParameter])).toBe(
      "State: CA",
    );
  });

  it("renders a numeric value", () => {
    expect(buildFilterText(buildPulse(42), [stateParameter])).toBe("State: 42");
  });

  it("summarizes multi-value selections", () => {
    expect(buildFilterText(buildPulse(["CA", "NY"]), [stateParameter])).toBe(
      "State: 2 selections",
    );
  });

  it("omits a filter whose only entries are nullish", () => {
    expect(buildFilterText(buildPulse([null]), [stateParameter])).toBe("");
  });

  it("mentions the number of additional filters", () => {
    const cityParameter = createMockUiParameter({
      id: "2",
      name: "City",
      slug: "city",
      type: "string/=",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [
        createMockParameter({ id: "1", value: "CA" }),
        createMockParameter({ id: "2", value: "SF" }),
      ],
    });
    expect(buildFilterText(pulse, [stateParameter, cityParameter])).toBe(
      "State: CA and 1 more filter",
    );
  });

  it("formats date parameter values", () => {
    const dateParameter = createMockUiParameter({
      id: "3",
      name: "Created At",
      slug: "created_at",
      type: "date/single",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [createMockParameter({ id: "3", value: "2024-01-15" })],
    });
    expect(buildFilterText(pulse, [dateParameter])).toBe(
      "Created At: January 15, 2024",
    );
  });

  it("omits a date filter whose value doesn't parse, and doesn't count it", () => {
    const dateParameter = createMockUiParameter({
      id: "3",
      name: "Created At",
      slug: "created_at",
      type: "date/single",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [
        createMockParameter({ id: "3", value: "not a date" }),
        createMockParameter({ id: "1", value: "CA" }),
      ],
    });
    expect(buildFilterText(pulse, [dateParameter, stateParameter])).toBe(
      "State: CA",
    );
  });
});

describe("getActiveFilters", () => {
  it("leaves out a date filter whose value doesn't parse", () => {
    const dateParameter = createMockUiParameter({
      id: "3",
      name: "Created At",
      type: "date/single",
    });
    const stateParameter = createMockUiParameter({
      id: "1",
      name: "State",
      type: "string/=",
    });
    const pulse = createMockDashboardSubscription({
      parameters: [
        createMockParameter({ id: "3", value: "not a date" }),
        createMockParameter({ id: "1", value: "CA" }),
      ],
    });
    expect(
      getActiveFilters(pulse, [dateParameter, stateParameter]).map(
        (parameter) => parameter.name,
      ),
    ).toEqual(["State"]);
  });
});

describe("formatFilter", () => {
  it("lists every value of a filter", () => {
    expect(
      formatFilter(
        createMockParameter({ name: "State", value: ["CA", "NY", "WA"] }),
      ),
    ).toBe("State: CA, NY, and WA");
  });

  it("formats date values", () => {
    expect(
      formatFilter(
        createMockParameter({
          name: "Created At",
          type: "date/single",
          value: "2024-01-15",
        }),
      ),
    ).toBe("Created At: January 15, 2024");
  });

  it("formats relative date values", () => {
    expect(
      formatFilter(
        createMockParameter({
          name: "Created At",
          type: "date/relative",
          value: "past30days",
        }),
      ),
    ).toBe("Created At: Previous 30 days");
  });

  it("describes a time grouping value", () => {
    expect(
      formatFilter(
        createMockParameter({
          name: "Group by",
          type: "temporal-unit",
          value: "month",
        }),
      ),
    ).toBe("Group by: Month");
  });
});

describe("formatSubscriptionSchedule", () => {
  it("formats hourly and daily schedules", () => {
    expect(
      formatSubscriptionSchedule(
        createMockChannel({ schedule_type: "hourly" }),
      ),
    ).toBe("Hourly");
    expect(
      formatSubscriptionSchedule(
        createMockChannel({ schedule_type: "daily", schedule_hour: 8 }),
      ),
    ).toBe("Daily at 8:00 AM");
  });

  it("formats a weekly schedule with the day of the week", () => {
    expect(
      formatSubscriptionSchedule(
        createMockChannel({
          schedule_type: "weekly",
          schedule_day: "mon",
          schedule_hour: 9,
        }),
      ),
    ).toBe("Mondays at 9:00 AM");
  });

  it("formats a monthly schedule with the frame and day", () => {
    expect(
      formatSubscriptionSchedule(
        createMockChannel({
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
        }),
      ),
    ).toBe("Monthly on the first Monday at 8:00 AM");
    expect(
      formatSubscriptionSchedule(
        createMockChannel({
          schedule_type: "monthly",
          schedule_frame: "last",
          schedule_hour: 20,
        }),
      ),
    ).toBe("Monthly on the last calendar day at 8:00 PM");
  });

  it.each<Partial<Channel>>([
    { schedule_type: "daily" },
    { schedule_type: "weekly", schedule_hour: 9 },
    { schedule_type: "weekly", schedule_day: "mon" },
    { schedule_type: "monthly", schedule_hour: 8 },
    { schedule_type: "monthly", schedule_frame: "first" },
  ])(
    "says the schedule is not set when $schedule_type misses a field",
    (opts) => {
      expect(formatSubscriptionSchedule(createMockChannel(opts))).toBe(
        "Schedule not set",
      );
    },
  );
});

describe("formatSubscriptionDelivery", () => {
  afterEach(() => {
    mockSettings();
  });

  it("says how and when a subscription sends", () => {
    expect(
      formatSubscriptionDelivery(
        createMockChannel({ schedule_type: "daily", schedule_hour: 8 }),
      ),
    ).toBe("Emailed daily at 8:00 AM");
    expect(
      formatSubscriptionDelivery(
        createMockChannel({
          channel_type: "slack",
          details: { channel: "#sales" },
          schedule_type: "hourly",
        }),
      ),
    ).toBe("Sent to #sales hourly");
    expect(
      formatSubscriptionDelivery(
        createMockChannel({
          channel_type: "http",
          schedule_type: "weekly",
          schedule_day: "mon",
          schedule_hour: 8,
        }),
      ),
    ).toBe("Sent Monday at 8:00 AM");
  });

  it("formats monthly schedules with and without a day of the week", () => {
    expect(
      formatSubscriptionDelivery(
        createMockChannel({
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_day: "mon",
          schedule_hour: 8,
        }),
      ),
    ).toBe("Emailed monthly on the first Monday at 8:00 AM");
    expect(
      formatSubscriptionDelivery(
        createMockChannel({
          schedule_type: "monthly",
          schedule_frame: "first",
          schedule_hour: 8,
        }),
      ),
    ).toBe("Emailed monthly on the first calendar day at 8:00 AM");
  });

  it("says the schedule is not set when it misses its hour", () => {
    expect(
      formatSubscriptionDelivery(
        createMockChannel({ schedule_type: "daily", schedule_hour: null }),
      ),
    ).toBe("Schedule not set");
  });

  it("uses the instance's time format", () => {
    mockSettings({
      "custom-formatting": { "type/Temporal": { time_style: "HH:mm" } },
    });
    const channel = createMockChannel({
      schedule_type: "daily",
      schedule_hour: 20,
    });

    expect(formatSubscriptionDelivery(channel)).toBe("Emailed daily at 20:00");
    expect(formatSubscriptionSchedule(channel)).toBe("Daily at 20:00");
  });
});

describe("buildRecipientText", () => {
  const buildPulse = (recipientNames: string[]) =>
    createMockDashboardSubscription({
      channels: [
        createMockChannel({
          recipients: recipientNames.map((common_name, index) =>
            createMockUser({ common_name, email: `user${index}@example.com` }),
          ),
        }),
      ],
    });

  it("names the first email recipient and counts the others", () => {
    expect(buildRecipientText(buildPulse(["Ada Lovelace"]))).toBe(
      "Ada Lovelace",
    );
    expect(
      buildRecipientText(
        buildPulse(["Ada Lovelace", "Alan Turing", "Grace Hopper"]),
      ),
    ).toBe("Ada Lovelace and 2 others");
  });

  it("counts an address saved both as a user and as a plain email once", () => {
    expect(
      buildRecipientText(
        createMockDashboardSubscription({
          channels: [
            createMockChannel({
              recipients: [
                { email: "ada@example.com" },
                createMockUser({
                  common_name: "Ada Lovelace",
                  email: "ada@example.com",
                }),
                { email: "ext@partner.com" },
              ],
            }),
          ],
        }),
      ),
    ).toBe("Ada Lovelace and 1 other");
  });

  it("names a recipient outside Metabase by their address", () => {
    expect(
      buildRecipientText(
        createMockDashboardSubscription({
          channels: [
            createMockChannel({ recipients: [{ email: "ada@example.com" }] }),
          ],
        }),
      ),
    ).toBe("ada@example.com");
  });

  it("returns an empty string for a subscription without a channel", () => {
    expect(
      buildRecipientText(createMockDashboardSubscription({ channels: [] })),
    ).toBe("");
  });

  it("returns an empty string for a Slack channel", () => {
    expect(
      buildRecipientText(
        createMockDashboardSubscription({
          channels: [
            createMockChannel({
              channel_type: "slack",
              details: { channel: "#sales" },
            }),
          ],
        }),
      ),
    ).toBe("");
  });
});

describe("getRecipientName", () => {
  it("prefers a user's name to their address", () => {
    expect(
      getRecipientName(
        createMockUser({
          common_name: "Ada Lovelace",
          email: "ada@example.com",
        }),
      ),
    ).toBe("Ada Lovelace");
  });

  it("uses the address of a recipient outside Metabase", () => {
    expect(getRecipientName({ email: "ada@example.com" })).toBe(
      "ada@example.com",
    );
  });
});

describe("getChannelRecipients", () => {
  it("lists an address saved both as a user and as a plain email once, as the user", () => {
    const user = createMockUser({
      common_name: "Ada Lovelace",
      email: "ada@example.com",
    });
    const channel = createMockChannel({
      recipients: [{ email: "ada@example.com" }, user],
    });

    expect(getChannelRecipients(channel)).toEqual([
      { type: "user", name: "Ada Lovelace", email: "ada@example.com" },
    ]);
  });

  it("keeps an address outside Metabase as an external recipient", () => {
    const channel = createMockChannel({
      recipients: [{ email: "ext@partner.com" }],
    });

    expect(getChannelRecipients(channel)).toEqual([
      { type: "external", email: "ext@partner.com" },
    ]);
  });
});
