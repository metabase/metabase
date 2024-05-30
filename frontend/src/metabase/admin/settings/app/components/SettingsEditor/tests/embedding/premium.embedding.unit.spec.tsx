import { act, screen } from "__support__/ui";

import type { SetupOpts } from "./setup";
import {
  goToInteractiveEmbeddingSettings,
  goToStaticEmbeddingSettings,
  setupEmbedding,
  getQuickStartLink,
  embeddingSettingsUrl,
  interactiveEmbeddingSettingsUrl,
  staticEmbeddingSettingsUrl,
} from "./setup";

const setupPremium = (opts?: SetupOpts) => {
  return setupEmbedding({
    ...opts,
    hasEnterprisePlugins: true,
    hasEmbeddingFeature: true,
  });
};

describe("[EE, with token] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
        const { history } = await setupPremium({
          settingValues: { "enable-embedding": false },
        });

        expect(
          await screen.findByRole("button", { name: "Manage" }),
        ).toBeDisabled();

        act(() => {
          history.push(staticEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });

      it("should not prompt to upgrade to remove the Powered by text", async () => {
        await setupPremium({
          settingValues: { "enable-embedding": false },
        });

        expect(
          screen.queryByText("upgrade to a paid plan"),
        ).not.toBeInTheDocument();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        const { history } = await setupPremium({
          settingValues: { "enable-embedding": false },
        });

        expect(
          await screen.findByRole("button", { name: "Configure" }),
        ).toBeDisabled();

        act(() => {
          history.push(interactiveEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });

      it("should link to quickstart for interactive embedding", async () => {
        await setupPremium({
          settingValues: {
            "enable-embedding": false,
            version: { tag: "v1.49.3" },
          },
        });
        expect(getQuickStartLink()).toBeInTheDocument();
        expect(getQuickStartLink()).toHaveProperty(
          "href",
          "https://www.metabase.com/docs/v0.49/embedding/interactive-embedding-quick-start-guide.html?utm_source=pro-self-hosted&utm_media=embed-settings",
        );
      });
    });
  });
  describe("when the embedding is enabled", () => {
    it("should allow going to static embedding settings page", async () => {
      const { history } = await setupPremium({
        settingValues: { "enable-embedding": true },
      });

      await goToStaticEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
    });

    it("should allow going to interactive embedding settings page", async () => {
      const { history } = await setupPremium({
        settingValues: { "enable-embedding": true },
      });

      await goToInteractiveEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(interactiveEmbeddingSettingsUrl);
    });
  });
});
