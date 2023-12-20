import { screen } from "__support__/ui";
import {
  goToStaticEmbeddingSettings,
  setupEmbedding,
  getQuickStartLink,
  goToInteractiveEmbeddingSettings,
  staticEmbeddingSettingsUrl,
  embeddingSettingsUrl,
  interactiveEmbeddingSettingsUrl,
} from "./setup";

let embeddingSettingEnabled = false;
describe("[OSS] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    beforeEach(() => {
      embeddingSettingEnabled = false;
    });
    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
        const { history } = await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });

        expect(() => {
          goToStaticEmbeddingSettings();
        }).toThrow();

        history.push(staticEmbeddingSettingsUrl);

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        const { history } = await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });

        history.push(interactiveEmbeddingSettingsUrl);

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });

      it("should have a learn more button for interactive embedding", async () => {
        await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });
        expect(
          screen.getByRole("link", { name: "Learn More" }),
        ).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Learn More" })).toHaveProperty(
          "href",
          "https://www.metabase.com/product/embedded-analytics?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta",
        );
      });

      it("should link to quickstart for interactive embedding", async () => {
        await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });
        expect(getQuickStartLink()).toBeInTheDocument();
        expect(getQuickStartLink()).toHaveProperty(
          "href",
          "https://www.metabase.com/learn/customer-facing-analytics/interactive-embedding-quick-start?utm_source=product&utm_medium=CTA&utm_campaign=embed-settings-oss-cta",
        );
      });

      it("should link to https://www.metabase.com/blog/why-full-app-embedding", async () => {
        await setupEmbedding({
          settingValues: { "enable-embedding": embeddingSettingEnabled },
        });

        expect(
          screen.getByText("offer multi-tenant, self-service analytics"),
        ).toHaveProperty(
          "href",
          "https://www.metabase.com/blog/why-full-app-embedding",
        );
      });
    });
  });
  describe("when the embedding is enabled", () => {
    beforeEach(() => {
      embeddingSettingEnabled = true;
    });
    it("should allow going to static embedding settings page", async () => {
      const { history } = await setupEmbedding({
        settingValues: { "enable-embedding": embeddingSettingEnabled },
      });

      goToStaticEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
    });

    it("should not allow going to interactive embedding settings page", async () => {
      const { history } = await setupEmbedding({
        settingValues: { "enable-embedding": embeddingSettingEnabled },
      });

      expect(() => goToInteractiveEmbeddingSettings()).toThrow();

      history.push(interactiveEmbeddingSettingsUrl);

      expect(history.getCurrentLocation().pathname).toEqual(
        embeddingSettingsUrl,
      );
    });
  });
});
