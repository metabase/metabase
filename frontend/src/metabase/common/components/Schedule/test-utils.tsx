import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import type { ScheduleType, TokenFeatures } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import type { ScheduleProps } from "./Schedule";
import { Schedule } from "./Schedule";
export interface SetupOpts {
  hasEnterprisePlugins?: boolean;
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
const mockOnScheduleChange = jest.fn();

export const setup = ({
  hasEnterprisePlugins,
  tokenFeatures = {},
  ...props
}: SetupOpts & Partial<ScheduleProps> = {}) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures(tokenFeatures),
      }),
    ),
  });

  if (hasEnterprisePlugins) {
    setupEnterprisePlugins();
  }

  const propsWithDefaults = {
    cronString: props.cronString ?? "0 0 8 * * ? *",
    scheduleOptions: mockScheduleOptions,
    onScheduleChange: mockOnScheduleChange,
    timezone: mockTimezone,
    verb: mockVerb,
    ...props,
  };

  return renderWithProviders(<Schedule {...propsWithDefaults} />, {
    storeInitialState,
  });
};
