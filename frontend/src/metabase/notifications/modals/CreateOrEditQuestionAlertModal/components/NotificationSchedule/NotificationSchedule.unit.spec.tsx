import { screen } from "__support__/ui";

import { setup } from "./setup";

describe("NotificationSchedule", () => {
  it("should show warning when notification schedule is set to less than 10 minutes", () => {
    setup({
      subscription: {
        id: 1,
        notification_id: 1,
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: "0 0/5 * * * ?", // every 5 minutes
        created_at: "2025-03-14T16:11:12Z",
      },
    });

    expect(
      screen.getByText(
        /If an alert is still in progress when the next one is scheduled, the next alert will be skipped/,
      ),
    ).toBeInTheDocument();
  });

  it("should not show warning when notification schedule is set to 10 or more minutes", () => {
    setup({
      subscription: {
        id: 1,
        notification_id: 1,
        type: "notification-subscription/cron",
        event_name: null,
        cron_schedule: "0 0/10 * * * ?", // every 10 minutes
        created_at: "2025-03-14T16:11:12Z",
      },
    });

    expect(
      screen.queryByText(
        /If an alert is still in progress when the next one is scheduled, the next alert will be skipped/,
      ),
    ).not.toBeInTheDocument();
  });
});
