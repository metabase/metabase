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

let embeddingSettingEnabled = false;
describe("[EE] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    beforeEach(() => {
      embeddingSettingEnabled = false;
    });
    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
        await setupEnterprise({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });

        expect(() => {
          goToStaticEmbeddingSettings();
        }).toThrow();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        await setupEnterprise({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });

        expect(() => {
          goToInteractiveEmbeddingSettings();
        }).toThrow();
      });

      it("should link to quickstart for interactive embedding", async () => {
        await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });
        expect(getQuickStartLink()).toBeInTheDocument();
        expect(getQuickStartLink()).toHaveProperty(
          "href",
          "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-ee-cta",
        );
      });
    });
  });
  describe("when the embedding is enabled", () => {
    beforeEach(() => {
      embeddingSettingEnabled = true;
    });
    it("should allow going to static embedding settings page", async () => {
      const { history } = await setupEnterprise({
        settingValues: { "enable-embedding": embeddingSettingEnabled },
      });

      goToStaticEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(
        "/admin/settings/embedding-in-other-applications/standalone",
      );
    });

    it("should allow going to interactive embedding settings page", async () => {
      const { history } = await setupEnterprise({
        settingValues: { "enable-embedding": embeddingSettingEnabled },
      });

      goToInteractiveEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(
        "/admin/settings/embedding-in-other-applications/full-app",
      );
    });
  });
});
