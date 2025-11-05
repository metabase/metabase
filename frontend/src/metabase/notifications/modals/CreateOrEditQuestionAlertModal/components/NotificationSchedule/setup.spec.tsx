import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  NotificationCronSubscription,
  ScheduleType,
} from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import { NotificationSchedule } from "./NotificationSchedule";

interface SetupOpts {
  subscription?: NotificationCronSubscription;
}

const mockScheduleOptions: ScheduleType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
];

const mockOnScheduleChange = jest.fn();

export const setup = ({ subscription }: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "report-timezone-short": "UTC",
    }),
  });

  const props = {
    scheduleOptions: mockScheduleOptions,
    onScheduleChange: mockOnScheduleChange,
    subscription,
  };

  renderWithProviders(<NotificationSchedule {...props} />, {
    storeInitialState: state,
  });

  return props;
};
