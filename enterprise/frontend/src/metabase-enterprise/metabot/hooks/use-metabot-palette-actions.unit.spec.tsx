import { setupEnterprisePlugins } from "__support__/enterprise";
import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockSettings } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { useMetabotPaletteActions } from "./use-metabot-palette-actions";

const setup = ({
  metabotFeatureEnabled = true,
}: {
  metabotFeatureEnabled?: boolean;
} = {}) => {
  const settings = createMockSettings({
    "metabot-feature-enabled": metabotFeatureEnabled,
  });

  setupEnterprisePlugins();
  setupPropertiesEndpoints(settings);

  return renderHookWithProviders(() => useMetabotPaletteActions(""), {
    storeInitialState: createMockState({
      settings: mockSettings(settings),
    }),
  });
};

describe("useMetabotPaletteActions", () => {
  it("should return no actions when metabot is disabled", async () => {
    const { result } = setup({ metabotFeatureEnabled: false });
    expect(result.current).toEqual([]);
  });

  it("should return one action when metabot is enabled", async () => {
    const { result } = setup({ metabotFeatureEnabled: true });

    await waitFor(() => {
      expect(result.current).toHaveLength(1);
    });
  });
});
