import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders } from "__support__/ui";
import type { ScheduleValueType } from "metabase/common/components/Schedule/domain";
import type { NotificationCronSubscription } from "metabase-types/api";

import { NotificationSchedule } from "./NotificationSchedule";

interface SetupOpts {
  subscription?: NotificationCronSubscription;
}

const mockSubscription: NotificationCronSubscription = {
  id: 1,
  notification_id: 1,
  type: "notification-subscription/cron",
  event_name: null,
  cron_schedule: "0 0 8 * * ? *",
  created_at: "2025-03-14T16:11:12Z",
  ui_display_type: "cron/builder",
};

const mockScheduleOptions: ScheduleValueType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

const mockOnScheduleChange = jest.fn();

export const setup = ({ subscription = mockSubscription }: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "report-timezone-short": "UTC",
    }),
  });

  const props = {
    scheduleOptions: mockScheduleOptions,
    onScheduleChange: mockOnScheduleChange,
    initialSubscription: subscription,
  };

  renderWithProviders(<NotificationSchedule {...props} />, {
    storeInitialState: state,
  });

  return props;
};
