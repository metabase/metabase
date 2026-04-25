import type { ScheduleSettings } from "metabase-types/api";

import { formatNotificationCheckSchedule } from "./utils";

const scheduleSettings = (
  overrides: Partial<ScheduleSettings>,
): ScheduleSettings => ({
  schedule_type: "daily",
  schedule_day: null,
  schedule_frame: null,
  schedule_hour: 9,
  schedule_minute: 0,
  ...overrides,
});

describe("formatNotificationCheckSchedule", () => {
  it("renders a readable label for a normal daily schedule", () => {
    const label = formatNotificationCheckSchedule(
      scheduleSettings({ schedule_type: "daily", schedule_hour: 9 }),
      "0 0 9 * * ?",
    );
    // the 12h/24h format is environment-dependent, so just assert the stem
    expect(label).toMatch(/^Check daily at /);
    expect(label).not.toMatch(/NaN/);
  });

  it("returns null when schedule_hour is NaN (bad cron)", () => {
    // Covers the regression where a malformed cron made schedule_hour NaN
    // and the formatter produced "Check daily at NaN".
    const label = formatNotificationCheckSchedule(
      scheduleSettings({ schedule_type: "daily", schedule_hour: NaN }),
      "0 0 garbage * * ?",
    );
    expect(label).toBeNull();
  });

  it("returns null when schedule_hour is undefined for weekly", () => {
    const label = formatNotificationCheckSchedule(
      scheduleSettings({
        schedule_type: "weekly",
        schedule_hour: undefined,
        schedule_day: "mon",
      }),
      "0 0 * ? * 2",
    );
    expect(label).toBeNull();
  });

  it("returns null when schedule_hour is NaN for monthly", () => {
    const label = formatNotificationCheckSchedule(
      scheduleSettings({
        schedule_type: "monthly",
        schedule_hour: NaN,
        schedule_frame: "first",
      }),
      "0 0 ? * * ? *",
    );
    expect(label).toBeNull();
  });
});
