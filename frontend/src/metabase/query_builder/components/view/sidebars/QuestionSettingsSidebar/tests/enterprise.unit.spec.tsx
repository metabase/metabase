import { screen } from "__support__/ui";
import type { TokenFeatures } from "metabase-types/api";
import {
  createMockCard,
  createMockSettings,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import type { SetupOpts } from "./setup";
import { setup } from "./setup";

const setupEnterprise = (
  opts: SetupOpts,
  tokenFeatures: Partial<TokenFeatures>,
) => {
  return setup({
    ...opts,
    settings: createMockSettings({
      ...opts.settings,
      "token-features": createMockTokenFeatures({
        ...tokenFeatures,
      }),
    }),
    hasEnterprisePlugins: true,
  });
};

describe("QuestionSettingsSidebar", () => {
  describe("question caching", () => {
    const card = createMockCard({
      cache_ttl: 10,
      description: "abc",
    });

    it("should show caching controls with cache token feature", async () => {
      await setupEnterprise({ card }, { cache_granular_controls: true });
      expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    });
  });
});
