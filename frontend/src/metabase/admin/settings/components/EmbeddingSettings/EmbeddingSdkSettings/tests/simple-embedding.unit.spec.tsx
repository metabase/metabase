import userEvent from "@testing-library/user-event";

import { findRequests } from "__support__/server-mocks";
import { screen } from "__support__/ui";

import { type SetupOpts, setup as baseSetup } from "./setup";

const setup = (opts: SetupOpts = {}) =>
  baseSetup({
    hasEnterprisePlugins: true,
    tokenFeatures: {
      embedding_sdk: true,
      embedding_iframe_sdk: true,
    },
    ...opts,
  });

describe("EmbeddingSdkSettings (EE with Simple Embedding feature)", () => {
  it("should show both SDK and Simple Embedding toggles", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
      showSimpleEmbedTerms: false,
    });

    const toggles = screen.getAllByRole("switch");
    expect(toggles).toHaveLength(2);

    expect(screen.getByText("Embedding SDK for React")).toBeInTheDocument();

    expect(screen.getByText("Simple Embedding")).toBeInTheDocument();
    expect(screen.queryAllByText("Beta")).toHaveLength(1);
  });

  it("should show legalese modal when Simple Embedding toggle is enabled", async () => {
    await setup({
      isEmbeddingSdkEnabled: false,
      isEmbeddingSimpleEnabled: false,
      showSdkEmbedTerms: false,
      showSimpleEmbedTerms: true,
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Check the Simple Embedding toggle
    await userEvent.click(screen.getByLabelText("Simple Embedding"));

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
      showSimpleEmbedTerms: true,
    });

    await userEvent.click(screen.getByLabelText("Simple Embedding"));
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

  describe("Authorized Origins input field", () => {
    it("should be disabled when both SDK and simple embedding are disabled", async () => {
      await setup({
        isEmbeddingSdkEnabled: false,
        isEmbeddingSimpleEnabled: false,
        showSdkEmbedTerms: false,
        showSimpleEmbedTerms: false,
      });

      expect(screen.getByText("Authorized Origins")).toBeInTheDocument();

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
          showSimpleEmbedTerms: false,
        });

        const originInput = screen.getByPlaceholderText(
          "https://*.example.com",
        );
        expect(originInput).toBeEnabled();
      },
    );
  });
});
