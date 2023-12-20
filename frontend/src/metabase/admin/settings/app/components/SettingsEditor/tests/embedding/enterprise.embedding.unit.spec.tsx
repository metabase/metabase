import { screen } from "__support__/ui";
import {
  goToInteractiveEmbeddingSettings,
  goToStaticEmbeddingSettings,
  setupEmbedding,
  getQuickStartLink,
} from "./setup";
import type { SetupOpts } from "./setup";

const setupEnterprise = (opts?: SetupOpts) => {
  return setupEmbedding({
    ...opts,
    hasEmbeddingFeature: true,
  });
};

describe("[EE] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
        await setupEnterprise({
          settingValues: { "enable-embedding": false },
        });

        expect(() => {
          goToStaticEmbeddingSettings();
        }).toThrow();
      });

      it("should not prompt to upgrade to remove the Powered by text", async () => {
        await setupEnterprise({
          settingValues: { "enable-embedding": false },
        });

        expect(
          screen.queryByText("upgrade to a paid plan"),
        ).not.toBeInTheDocument();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        await setupEnterprise({
          settingValues: { "enable-embedding": false },
        });

        expect(() => {
          goToInteractiveEmbeddingSettings();
        }).toThrow();
      });

      it("should link to quickstart for interactive embedding", async () => {
        await setupEmbedding({
          settingValues: { "enable-embedding": false },
        });
        expect(getQuickStartLink()).toBeInTheDocument();
        expect(getQuickStartLink()).toHaveProperty(
          "href",
          "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-pro-cta",
        );
      });
    });
  });
  describe("when the embedding is enabled", () => {
    it("should allow going to static embedding settings page", async () => {
      const { history } = await setupEnterprise({
        settingValues: { "enable-embedding": true },
      });

      goToStaticEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(
        "/admin/settings/embedding-in-other-applications/standalone",
      );
    });

    it("should allow going to interactive embedding settings page", async () => {
      const { history } = await setupEnterprise({
        settingValues: { "enable-embedding": true },
      });

      goToInteractiveEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(
        "/admin/settings/embedding-in-other-applications/full-app",
      );
    });
  });
});
