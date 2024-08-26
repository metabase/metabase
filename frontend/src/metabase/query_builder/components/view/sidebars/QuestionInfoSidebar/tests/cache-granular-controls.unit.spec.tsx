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
  it("should show caching controls", async () => {
    const card = createMockCard({});
    const settings = createMockSettings({});
    await setupGranularCacheControls({ card, settings });
    expect(screen.getByText("Caching policy")).toBeInTheDocument();
  });
});
