import { useState } from "react";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type {
  ScheduleSettings,
  ScheduleType,
  TokenFeatures,
} from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { ScheduleProps } from "./Schedule";
import { Schedule } from "./Schedule";
export interface SetupOpts {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  tokenFeatures?: Partial<TokenFeatures>;
}

const mockScheduleOptions: ScheduleType[] = [
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
  ...props
}: SetupOpts & Partial<ScheduleProps> = {}) => {
  const onScheduleChange = jest.fn();

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const propsWithDefaults: ScheduleProps = {
    cronString: props.cronString ?? "0 0 8 * * ? *",
    scheduleOptions: mockScheduleOptions,
    onScheduleChange,
    timezone: mockTimezone,
    verb: mockVerb,
    ...props,
  };

  const renderResult = renderWithProviders(
    <Schedule {...propsWithDefaults} />,
    { storeInitialState: buildStoreState({ tokenFeatures }) },
  );

  return { ...renderResult, onScheduleChange };
};

/**
 * Stateful wrapper that holds the cron string in React state and re-renders
 * `<Schedule>` after every change. Required for tests that drive multiple
 * sequential clicks — `<Schedule>` derives its settings from `cronString` on
 * each render, so the parent must update `cronString` for subsequent clicks
 * to see the new state.
 */
export const setupHarness = ({
  enterprisePlugins,
  tokenFeatures = {},
  initialCronString = "0 0 * * * ? *",
  ...props
}: SetupOpts &
  Omit<Partial<ScheduleProps>, "cronString" | "onScheduleChange"> & {
    initialCronString?: string;
  } = {}) => {
  const onScheduleChange = jest.fn<void, [string, ScheduleSettings]>();

  if (enterprisePlugins) {
    enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
  }

  const Harness = () => {
    const [cron, setCron] = useState(initialCronString);
    return (
      <Schedule
        cronString={cron}
        scheduleOptions={mockScheduleOptions}
        timezone={mockTimezone}
        verb={mockVerb}
        {...props}
        onScheduleChange={(next, settings) => {
          onScheduleChange(next, settings);
          setCron(next);
        }}
      />
    );
  };

  const renderResult = renderWithProviders(<Harness />, {
    storeInitialState: buildStoreState({ tokenFeatures }),
  });

  return { ...renderResult, onScheduleChange };
};
