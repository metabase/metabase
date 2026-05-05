import { screen } from "__support__/ui";
import type { ScheduleDisplayType } from "metabase-types/api";

import { setup } from "./setup.spec";

describe("NotificationSchedule", () => {
  it("raw - should correctly parse day of week from cron expression", () => {
    // In Quartz cron format, days are 1-based: 1=SUN, 2=MON, ..., 7=SAT
    // "0 0 9 ? * 2,4,6 *" means Monday, Wednesday, Friday at 9:00 AM
    setup({
      subscription: {
        id: 1,
        notification_id: 1,
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: "0 0 9 ? * 2,4,6 *",
        created_at: "2025-03-14T16:11:12Z",
        ui_display_type: "cron/raw",
      },
    });

    expect(
      screen.getByText(/Monday, Wednesday, and Friday/),
    ).toBeInTheDocument();
  });

  ["builder", "raw"].forEach((uiDisplayType) => {
    it(`${uiDisplayType} - should show warning when notification schedule is set to less than 10 minutes`, () => {
      setup({
        subscription: {
          id: 1,
          notification_id: 1,
          type: "notification-subscription/cron",
          event_name: null,
          cron_schedule: "0 0/5 * * * ? *", // every 5 minutes
          created_at: "2025-03-14T16:11:12Z",
          ui_display_type: `cron/${uiDisplayType}` as ScheduleDisplayType,
        },
      });

      expect(
        screen.getByText(
          /If an alert is still in progress when the next one is scheduled, the next alert will be skipped/,
        ),
      ).toBeInTheDocument();
    });

    it(`${uiDisplayType} - should not show warning when notification schedule is set to 10 or more minutes`, () => {
      setup({
        subscription: {
          id: 1,
          notification_id: 1,
          type: "notification-subscription/cron",
          event_name: null,
          cron_schedule: "0 0/10 * * * ? *", // every 10 minutes
          created_at: "2025-03-14T16:11:12Z",
          ui_display_type: `cron/${uiDisplayType}` as ScheduleDisplayType,
        },
      });

      expect(
        screen.queryByText(
          /If an alert is still in progress when the next one is scheduled, the next alert will be skipped/,
        ),
      ).not.toBeInTheDocument();
    });
  });
});
