import { screen } from "__support__/ui";
import type { ScheduleDisplayType } from "metabase-types/api";

import { setup } from "./setup.spec";

const UI_DISPLAY_TYPES: ScheduleDisplayType[] = ["cron/builder", "cron/raw"];

const SKIP_WARNING =
  /If an alert is still in progress when the next one is scheduled, the next alert will be skipped/;

const setupSchedule = (
  cronSchedule: string,
  uiDisplayType: ScheduleDisplayType = "cron/raw",
) =>
  setup({
    subscription: {
      id: 1,
      notification_id: 1,
      type: "notification-subscription/cron",
      event_name: null,
      cron_schedule: cronSchedule,
      created_at: "2025-03-14T16:11:12Z",
      ui_display_type: uiDisplayType,
    },
  });

describe("NotificationSchedule", () => {
  it("raw - should correctly parse day of week from cron expression", () => {
    // In Quartz cron format, days are 1-based: 1=SUN, 2=MON, ..., 7=SAT
    // "0 0 9 ? * 2,4,6 *" means Monday, Wednesday, Friday at 9:00 AM
    setupSchedule("0 0 9 ? * 2,4,6 *");

    expect(
      screen.getByText(/Monday, Wednesday, and Friday/),
    ).toBeInTheDocument();
  });

  UI_DISPLAY_TYPES.forEach((uiDisplayType) => {
    it(`${uiDisplayType} - should show warning when notification schedule is set to less than 10 minutes`, () => {
      setupSchedule("0 0/5 * * * ? *", uiDisplayType);

      expect(screen.getByText(SKIP_WARNING)).toBeInTheDocument();
    });

    it(`${uiDisplayType} - should not show warning when notification schedule is set to 10 or more minutes`, () => {
      setupSchedule("0 0/10 * * * ? *", uiDisplayType);

      expect(screen.queryByText(SKIP_WARNING)).not.toBeInTheDocument();
    });
  });

  it("raw - should not show warning when a custom schedule runs at a fixed minute", () => {
    setupSchedule("0 0 8 * * ? *");

    expect(screen.queryByText(SKIP_WARNING)).not.toBeInTheDocument();
  });
});
