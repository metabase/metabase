import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: {
      embedding_sdk: true,
      embedding_simple: true,
    },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Simple Embedding feature)", () => {
  it("should show both SDK and Simple Embedding toggles", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(2);

    expect(screen.getByText("SDK for React")).toBeInTheDocument();

    expect(screen.getByText("Embedded Analytics JS")).toBeInTheDocument();
  });

  it("should show legalese modal when Simple Embedding toggle is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Check the Simple Embedding toggle
    const toggles = screen.getAllByRole("switch");
    await userEvent.click(toggles[1]); // Second toggle is for Simple SDK Embedding

    // Should show the legalese modal
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("First, some legalese")).toBeInTheDocument();
    expect(screen.getByText("Decline and go back")).toBeInTheDocument();
    expect(screen.getByText("Agree and continue")).toBeInTheDocument();
  });

  it("should update simple embedding settings when user accepts terms", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
    });

    const toggles = screen.getAllByRole("switch");
    await userEvent.click(toggles[1]); // Second toggle is for Simple SDK Embedding
    await userEvent.click(screen.getByText("Agree and continue"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);

    const [{ body }] = puts;
    expect(body).toEqual({
      "enable-embedding-simple": true,
      "show-simple-embed-terms": false,
    });
  });

  it("should show embed button and docs when simple embedding is available", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: true,
      showSdkEmbedTerms: false,
    });

    const card = screen
      .getAllByTestId("sdk-setting-card")
      .find((card) => card.textContent?.includes("Embedded Analytics JS"));

    expect(card).toHaveTextContent("New embed");
    expect(card).toHaveTextContent("Documentation");
  });

  it("should not show embed button and docs when simple embedding is not available", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
      tokenFeatures: { embedding_sdk: false, embedding_simple: false },
    });

    const card = screen
      .getAllByTestId("sdk-setting-card")
      .find((card) => card.textContent?.includes("Embedded Analytics JS"));

    expect(card).not.toHaveTextContent("New embed");
    expect(card).not.toHaveTextContent("Documentation");
  });

  describe("Authorized Origins input field", () => {
    it("should be disabled when both SDK and simple embedding are disabled", async () => {
      await setup({
        isEmbeddingSdkEnabled: false,
        isEmbeddingSimpleEnabled: false,
        showSdkEmbedTerms: false,
      });

      expect(
        screen.getByText("Cross-Origin Resource Sharing (CORS)"),
      ).toBeInTheDocument();

      const originInput = screen.getByPlaceholderText("https://*.example.com");
      expect(originInput).toBeDisabled();
    });

    it.each([
      {
        description:
          "should be enabled when SDK is enabled and simple embedding is disabled",
        isEmbeddingSdkEnabled: true,
        isEmbeddingSimpleEnabled: false,
      },
      {
        description:
          "should be enabled when simple embedding is enabled and SDK is disabled",
        isEmbeddingSdkEnabled: false,
        isEmbeddingSimpleEnabled: true,
      },
      {
        description:
          "should be enabled when both SDK and simple embedding are enabled",
        isEmbeddingSdkEnabled: true,
        isEmbeddingSimpleEnabled: true,
      },
    ])(
      "$description",
      async ({ isEmbeddingSdkEnabled, isEmbeddingSimpleEnabled }) => {
        await setup({
          isEmbeddingSdkEnabled,
          isEmbeddingSimpleEnabled,
          showSdkEmbedTerms: false,
        });

        const originInput = screen.getByPlaceholderText(
          "https://*.example.com",
        );
        expect(originInput).toBeEnabled();
      },
    );
  });
});
