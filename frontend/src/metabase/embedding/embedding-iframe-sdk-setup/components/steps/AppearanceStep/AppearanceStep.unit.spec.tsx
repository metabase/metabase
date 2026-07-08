import { screen, waitFor } from "__support__/ui";
import { PLUGIN_EMBEDDING_IFRAME_SDK_SETUP } from "metabase/plugins";

import { setup } from "../../tests/test-setup";

const landOnAppearanceStep = (overrides?: Parameters<typeof setup>[0]) =>
  setup({
    initialState: { resourceId: 1, resourceType: "dashboard" },
    ...overrides,
  });

const getOptionCardsWrapper = () => {
  const wrapper = screen.getByText("Behavior").closest("[style*='opacity']");
  if (!wrapper) {
    throw new Error("Could not find option cards wrapper with opacity style");
  }
  return wrapper as HTMLElement;
};

describe("AppearanceStep > option cards dim state when landing on this step directly", () => {
  describe("OSS (simple-embedding plugin disabled)", () => {
    beforeEach(() => {
      PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => false);
    });

    it("does not dim the option cards", async () => {
      // showSimpleEmbedTerms is true in real OSS — the terms popup is
      // never shown to OSS users, so the setting never flips to false.
      landOnAppearanceStep({
        simpleEmbeddingEnabled: false,
        showSimpleEmbedTerms: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Behavior")).toBeVisible();
      });

      expect(getOptionCardsWrapper()).toHaveStyle({ opacity: "1" });
    });
  });

  describe("Pro (simple-embedding plugin enabled)", () => {
    beforeEach(() => {
      PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = jest.fn(() => true);
    });

    afterEach(() => {
      PLUGIN_EMBEDDING_IFRAME_SDK_SETUP.isEnabled = () => false;
    });

    it("dims the option cards when the user has not accepted the simple-embedding terms", async () => {
      landOnAppearanceStep({
        simpleEmbeddingEnabled: true,
        showSimpleEmbedTerms: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Behavior")).toBeVisible();
      });

      expect(getOptionCardsWrapper()).toHaveStyle({ opacity: "0.5" });
    });

    it("does not dim the option cards once the user has accepted the simple-embedding terms", async () => {
      landOnAppearanceStep({
        simpleEmbeddingEnabled: true,
        showSimpleEmbedTerms: false,
      });

      await waitFor(() => {
        expect(screen.getByText("Behavior")).toBeVisible();
      });

      expect(getOptionCardsWrapper()).toHaveStyle({ opacity: "1" });
    });

    it("dims the option cards when Guest is selected but the guest-embed terms have not been accepted", async () => {
      landOnAppearanceStep({
        initialState: {
          resourceId: 1,
          resourceType: "dashboard",
          isGuest: true,
        },
        simpleEmbeddingEnabled: true,
        showSimpleEmbedTerms: true,
        guestEmbeddingEnabled: false,
        showStaticEmbedTerms: true,
      });

      await waitFor(() => {
        expect(screen.getByText("Behavior")).toBeVisible();
      });

      expect(getOptionCardsWrapper()).toHaveStyle({ opacity: "0.5" });
    });

    it("does not dim the option cards when Guest is selected and the guest-embed terms are accepted, even if the simple-embedding terms are not", async () => {
      landOnAppearanceStep({
        initialState: {
          resourceId: 1,
          resourceType: "dashboard",
          isGuest: true,
        },
        simpleEmbeddingEnabled: true,
        showSimpleEmbedTerms: true,
        guestEmbeddingEnabled: true,
        showStaticEmbedTerms: false,
      });

      await waitFor(() => {
        expect(screen.getByText("Behavior")).toBeVisible();
      });

      expect(getOptionCardsWrapper()).toHaveStyle({ opacity: "1" });
    });
  });
});
