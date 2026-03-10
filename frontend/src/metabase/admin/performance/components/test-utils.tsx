import { Route } from "react-router";

import {
  setupEnterpriseOnlyPlugin,
  setupEnterprisePlugins,
} from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupTokenStatusEndpoint,
} from "__support__/server-mocks";
import { setupPerformanceEndpoints } from "__support__/server-mocks/performance";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import { CacheDurationUnit } from "metabase-types/api";
import {
  createMockCacheConfig,
  createMockCacheConfigWithDoNotCacheStrategy,
  createMockCacheConfigWithDurationStrategy,
  createMockCacheConfigWithMultiplierStrategy,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import { StrategyEditorForDatabases } from "./StrategyEditorForDatabases";

export interface SetupOpts {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][] | "*";
  tokenFeatures?: Partial<TokenFeatures>;
}

export const setupStrategyEditorForDatabases = ({
  enterprisePlugins,
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

  if (enterprisePlugins) {
    if (enterprisePlugins === "*") {
      setupEnterprisePlugins();
    } else {
      enterprisePlugins.forEach(setupEnterpriseOnlyPlugin);
    }
  }
  setupTokenStatusEndpoint({ valid: !!enterprisePlugins });

  const cacheConfigs = [
    createMockCacheConfigWithMultiplierStrategy({ model_id: 1 }),
    createMockCacheConfigWithDoNotCacheStrategy({ model_id: 2 }),
    createMockCacheConfigWithDurationStrategy({ model_id: 3 }),
    createMockCacheConfig({
      model: "root",
      model_id: 0,
      strategy: {
        type: "duration",
        duration: 1,
        unit: CacheDurationUnit.Hours,
        refresh_automatically: false,
      },
    }),
  ];
  setupPerformanceEndpoints(cacheConfigs);

  const databases = Array.from({ length: 4 }, (_, i) =>
    createSampleDatabase({ id: i + 1, name: `Database ${i + 1}`, tables: [] }),
  );
  setupDatabasesEndpoints(databases);

  const TestStrategyEditorForDatabases = () => <StrategyEditorForDatabases />;

  return renderWithProviders(
    <Route path="*" component={TestStrategyEditorForDatabases} />,
    {
      storeInitialState,
      withRouter: true,
    },
  );
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
