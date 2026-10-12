import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { ScheduleProps } from "./Schedule";
import { Schedule } from "./Schedule";
import type {
  GetScheduleDefaults,
  ScheduleValue,
  ScheduleValueType,
} from "./domain";
import { getScheduleDefaults } from "./domain";
import type { ScheduleChangeEvent } from "./types";

export const getDefaultsWithoutHour: GetScheduleDefaults = (scheduleType) => ({
  ...getScheduleDefaults(scheduleType),
  schedule_hour: null,
});

export interface SetupOpts {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
}

const mockScheduleOptions: ScheduleValueType[] = [
  "every_n_minutes",
  "hourly",
  "daily",
  "weekly",
  "monthly",
  "cron",
];
const mockVerb = "Send";
const mockTimezone = "America/New_York";

const buildStoreState = ({
  tokenFeatures = {},
}: Pick<SetupOpts, "tokenFeatures">) =>
  createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    ),
  });

export const setup = ({
  enterprisePlugins,
  tokenFeatures = {},
  value: initialValue,
  ...props
}: SetupOpts &
  Omit<Partial<ScheduleProps>, "onScheduleChange"> &
  Pick<ScheduleProps, "value">) => {
  const onScheduleChange = jest.fn<void, [ScheduleChangeEvent]>();

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const Harness = () => {
    const [value, setValue] = useState<ScheduleValue>(initialValue);
    return (
      <Schedule
        scheduleOptions={mockScheduleOptions}
        timezone={mockTimezone}
        verb={mockVerb}
        {...props}
        value={value}
        onScheduleChange={(event) => {
          onScheduleChange(event);
          setValue(event.value);
        }}
      />
    );
  };

  const renderResult = renderWithProviders(<Harness />, {
    storeInitialState: buildStoreState({ tokenFeatures }),
  });

  return { ...renderResult, onScheduleChange };
};
