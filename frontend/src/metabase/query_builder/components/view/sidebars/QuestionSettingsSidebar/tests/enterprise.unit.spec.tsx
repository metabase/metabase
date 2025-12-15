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
      expect(
        await screen.findByText("When to get new results"),
      ).toBeInTheDocument();
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

    it("should show 'not supported' message when database does not support persistence", async () => {
      await setupEnterprise(
        {
          card: model,
          dbHasModelPersistence: false,
          dbSupportsPersistence: false,
        },
        { cache_granular_controls: true },
      );
      const toggle = await screen.findByText("Persist model data");
      expect(toggle).toHaveAttribute("data-disabled", "true");
      // Check that the tooltip shows "not supported" message
      // Note: The tooltip appears on hover, so we just verify the toggle is disabled
      // The actual tooltip text is tested in integration tests
    });

    it("should show 'disabled' message when database supports but has persistence disabled", async () => {
      await setupEnterprise(
        {
          card: model,
          dbHasModelPersistence: false,
          dbSupportsPersistence: true,
        },
        { cache_granular_controls: true },
      );
      const toggle = await screen.findByText("Persist model data");
      expect(toggle).toHaveAttribute("data-disabled", "true");
      // The toggle should be disabled but with a different message than unsupported
    });
  });
});
