import { act, screen, within } from "__support__/ui";

import type { SetupOpts } from "./setup";
import {
  embeddingSettingsUrl,
  getQuickStartLink,
  goToInteractiveEmbeddingSettings,
  goToStaticEmbeddingSettings,
  interactiveEmbeddingSettingsUrl,
  setupEmbedding,
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
    let history: Awaited<ReturnType<typeof setupEmbedding>>["history"];

    beforeEach(async () => {
      history = (
        await setupPremium({
          settingValues: { "enable-embedding": false },
        })
      ).history;
    });

    describe("static embedding", () => {
      it("should not allow going to static embedding settings page", async () => {
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
        expect(
          screen.queryByText("upgrade to a paid plan"),
        ).not.toBeInTheDocument();
      });
    });

    describe("interactive embedding", () => {
      it("should not allow going to interactive settings page", async () => {
        expect(
          within(
            screen.getByRole("article", {
              name: "Interactive embedding",
            }),
          ).getByRole("button", { name: "Configure" }),
        ).toBeDisabled();

        act(() => {
          history.push(interactiveEmbeddingSettingsUrl);
        });

        expect(history.getCurrentLocation().pathname).toEqual(
          embeddingSettingsUrl,
        );
      });
    });
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

  describe("when the embedding is enabled", () => {
    let history: Awaited<ReturnType<typeof setupEmbedding>>["history"];

    beforeEach(async () => {
      history = (
        await setupPremium({
          settingValues: { "enable-embedding": true },
        })
      ).history;
    });

    it("should allow going to static embedding settings page", async () => {
      await goToStaticEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(staticEmbeddingSettingsUrl);
    });

    it("should allow going to interactive embedding settings page", async () => {
      await goToInteractiveEmbeddingSettings();

      const location = history.getCurrentLocation();
      expect(location.pathname).toEqual(interactiveEmbeddingSettingsUrl);
    });
  });
});
