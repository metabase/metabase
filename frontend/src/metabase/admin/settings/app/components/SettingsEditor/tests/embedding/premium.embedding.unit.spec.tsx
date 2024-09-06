import userEvent from "@testing-library/user-event";

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
import type { History } from "./types";

const setupPremium = (opts?: SetupOpts) => {
  return setupEmbedding({
    ...opts,
    hasEnterprisePlugins: true,
    hasEmbeddingFeature: true,
  });
};

describe("[EE, with token] embedding settings", () => {
  describe("when the embedding is disabled", () => {
    let history: History;

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

  describe("when the embedding SDK is disabled", () => {
    beforeEach(async () => {
      await setupPremium({
        settingValues: { "enable-embedding-sdk": false },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedding SDK for React",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedding SDK for React",
          }),
        ).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByText(
            /Interactive embedding with full, granular control./,
          ),
        ).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByLabelText("Disabled"),
        ).not.toBeChecked();
        expect(withinEmbeddingSdkCard.getByLabelText("Disabled")).toBeEnabled();
      });

      it("should allow access to the embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Configure" }),
        );

        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeDisabled();
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
    let history: History;

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

  describe("when the embedding SDK is enabled", () => {
    beforeEach(async () => {
      await setupPremium({
        settingValues: { "enable-embedding-sdk": true },
      });
    });

    describe("embedding SDK", () => {
      it("should show info about embedding SDK", async () => {
        const withinEmbeddingSdkCard = within(
          screen.getByRole("article", {
            name: "Embedding SDK for React",
          }),
        );

        expect(
          withinEmbeddingSdkCard.getByRole("heading", {
            name: "Embedding SDK for React",
          }),
        ).toBeInTheDocument();
        expect(
          withinEmbeddingSdkCard.getByText(
            /Interactive embedding with full, granular control./,
          ),
        ).toBeInTheDocument();
        expect(withinEmbeddingSdkCard.getByLabelText("Enabled")).toBeChecked();
        expect(withinEmbeddingSdkCard.getByLabelText("Enabled")).toBeEnabled();
      });

      it("should allow access to the embedding SDK settings page", async () => {
        // Go to embedding SDK settings page
        await userEvent.click(
          within(
            screen.getByRole("article", {
              name: "Embedding SDK for React",
            }),
          ).getByRole("button", { name: "Configure" }),
        );

        expect(
          screen.getByLabelText("Cross-Origin Resource Sharing (CORS)"),
        ).toBeEnabled();
      });
    });
  });
});
