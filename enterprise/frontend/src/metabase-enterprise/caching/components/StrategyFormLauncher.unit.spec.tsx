import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { rootId } from "metabase/admin/performance/constants/simple";
import { CacheDurationUnit } from "metabase-types/api";
import {
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import {
  StrategyFormLauncher,
  type StrategyFormLauncherProps,
} from "./StrategyFormLauncher";

const defaultProps: Pick<
  StrategyFormLauncherProps,
  "configs" | "isFormDirty" | "updateTargetId"
> = {
  configs: [
    {
      model: "root",
      model_id: 0,
      strategy: {
        type: "duration",
        duration: 96,
        unit: CacheDurationUnit.Hours,
        refresh_automatically: false,
      },
    },
    { model: "database", model_id: 1, strategy: { type: "nocache" } },
  ],
  isFormDirty: false,
  updateTargetId: (_: number | null, __: boolean) => {},
};

const renderStrategyFormLauncher = (props: StrategyFormLauncherProps) => {
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({}),
    settings: mockSettings(
      createMockSettings({
        "token-features": createMockTokenFeatures({
          cache_granular_controls: true,
        }),
      }),
    ),
  });

  setupEnterprisePlugins();

  return renderWithProviders(<StrategyFormLauncher {...props} />, {
    storeInitialState,
  });
};

describe("StrategyFormLauncher", () => {
  it("can render a button representing the default policy", async () => {
    renderStrategyFormLauncher({
      forId: rootId,
      targetId: null,
      title: "Default policy",
      ...defaultProps,
    });
    const launcher = await screen.findByLabelText(
      "Edit default policy (currently: Duration: 96h)",
    );
    expect(launcher).toHaveTextContent("Default policy");
    expect(launcher).toHaveAttribute("data-testid", "strategy-form-launcher");
  });

  it("can render a button representing a database with a Don't cache policy", async () => {
    renderStrategyFormLauncher({
      forId: 1,
      targetId: null,
      title: "Database 1",
      ...defaultProps,
    });
    const launcher = await screen.findByLabelText(
      "Edit policy for database 'Database 1' (currently: No caching)",
    );
    expect(launcher).toHaveTextContent("Database 1");
    expect(launcher).toHaveAttribute("data-testid", "strategy-form-launcher");
  });

  it("can render a button representing a database that inherits root policy", async () => {
    renderStrategyFormLauncher({
      forId: 2,
      targetId: null,
      title: "Database 2",
      ...defaultProps,
    });
    const launcher = await screen.findByLabelText(
      "Edit policy for database 'Database 2' (currently inheriting the default policy, Duration: 96h)",
    );
    expect(launcher).toHaveTextContent("Database 2");
    expect(launcher).toHaveAttribute(
      "data-testid",
      "strategy-form-launcher-with-tooltip",
    );
  });
});
