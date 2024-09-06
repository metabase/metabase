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
      expect(await screen.findByText("Caching")).toBeInTheDocument();
      expect(await screen.findByText("Caching policy")).toBeInTheDocument();
    });
  });

  describe("model caching", () => {
    const model = createMockCard({
      type: "model",
      persisted: true,
      description: "abc",
    });

    it("should show caching controls with cache token feature", async () => {
      await setupEnterprise(
        { card: model },
        {
          cache_granular_controls: true,
        },
      );
      expect(await screen.findByText("Persist model data")).toBeInTheDocument();
      expect(await screen.findByLabelText("Persist model data")).toBeChecked();
    });

    it("should show cache status when caching is enabled", async () => {
      await setupEnterprise(
        { card: model },
        {
          cache_granular_controls: true,
        },
      );
      expect(await screen.findByText("Persist model data")).toBeInTheDocument();
      expect(await screen.findByText(/Model last cached/)).toBeInTheDocument();
    });

    it("should disable model cache toggle when DB does not support model caching", async () => {
      await setupEnterprise(
        { card: model, dbHasModelPersistence: false },
        { cache_granular_controls: true },
      );
      expect(await screen.findByText("Persist model data")).toHaveAttribute(
        "data-disabled",
        "true",
      );
    });
  });
});
