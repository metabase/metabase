import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";
import { screen } from "__support__/ui";
import { setup, SetupOpts } from "./setup";

const setupGranularCacheControls = (opts: SetupOpts) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts?.settings,
      "token-features": createMockTokenFeatures({
        cache_granular_controls: true,
      }),
    }),
    hasEnterprisePlugins: true,
  });
};

describe("QuestionInfoSidebar", () => {
  it("should show caching controls if caching is enabled", async () => {
    const card = createMockCard({
      cache_ttl: 10,
    });
    const settings = createMockSettings({
      "enable-query-caching": true,
    });
    await setupGranularCacheControls({ card, settings });
    expect(screen.getByText("Cache Configuration")).toBeInTheDocument();
  });

  it("should not show caching controls if caching is disabled", async () => {
    const card = createMockCard({
      cache_ttl: 10,
    });
    const settings = createMockSettings({
      "enable-query-caching": false,
    });
    await setupGranularCacheControls({ card, settings });
    expect(screen.queryByText("Cache Configuration")).not.toBeInTheDocument();
  });
});
