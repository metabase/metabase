import { screen } from "__support__/ui";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

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
    const card = createMockCard({});
    const settings = createMockSettings({
      "enable-query-caching": true,
    });
    await setupGranularCacheControls({ card, settings });
    expect(screen.getByText("Caching policy")).toBeInTheDocument();
  });

  it("should not show caching controls if caching is disabled", async () => {
    const card = createMockCard({
      cache_ttl: 10,
    });
    const settings = createMockSettings({
      "enable-query-caching": false,
    });
    await setupGranularCacheControls({ card, settings });
    expect(screen.queryByText("Cache policy")).not.toBeInTheDocument();
  });
});
