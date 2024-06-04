import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { DurationUnit } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import {
  createMockCacheConfig,
  createMockCacheConfigWithDoNotCacheStrategy,
  createMockCacheConfigWithDurationStrategy,
  createMockCacheConfigWithMultiplierStrategy,
} from "metabase-types/api/mocks/performance";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

export interface SetupOpts {
  hasEnterprisePlugins?: boolean;
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setupStrategyEditorForDatabases = ({
  hasEnterprisePlugins,
  tokenFeatures = {},
}: SetupOpts = {}) => {
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

  const cacheConfigs = [
    createMockCacheConfigWithMultiplierStrategy({ model_id: 1 }),
    createMockCacheConfigWithDoNotCacheStrategy({ model_id: 2 }),
    createMockCacheConfigWithDurationStrategy({ model_id: 3 }),
    createMockCacheConfig({
      model: "root",
      model_id: 0,
      strategy: { type: "duration", duration: 1, unit: DurationUnit.Hours },
    }),
  ];
  setupPerformanceEndpoints(cacheConfigs);

  const databases = Array.from({ length: 4 }, (_, i) =>
    createSampleDatabase({ id: i + 1, name: `Database ${i + 1}`, tables: [] }),
  );
  setupDatabasesEndpoints(databases);

  return renderWithProviders(<StrategyEditorForDatabases />, {
    storeInitialState,
  });
};

export const getSaveButton = async () =>
  await screen.findByTestId("strategy-form-submit-button");

export const changeInput = async (
  label: RegExp,
  expectedPlaceholder: number,
  value: number,
) => {
  const input = (await screen.findByRole("spinbutton", {
    name: new RegExp(label),
  })) as HTMLInputElement;
  expect(input).toHaveAttribute("placeholder", expectedPlaceholder.toString());
  act(() => {
    fireEvent.change(input, { target: { value } });
  });
  expect(input).toHaveValue(value);
};
