import { renderWithProviders, screen } from "__support__/ui";

import { setup as baseSetup } from "../../tests/setup";
import { EmbeddingSecuritySettings } from "../EmbeddingSecuritySettings";

const setup = async ({
  showSdkEmbedTerms,
  isEmbeddingSdkEnabled,
  isEmbeddingSimpleEnabled,
}: {
  showSdkEmbedTerms?: boolean;
  isEmbeddingSdkEnabled?: boolean;
  isEmbeddingSimpleEnabled?: boolean;
} = {}) => {
  await baseSetup({
    renderCallback: ({ state }) =>
      renderWithProviders(<EmbeddingSecuritySettings />, {
        storeInitialState: state,
      }),
    showSdkEmbedTerms,
    isEmbeddingSdkEnabled,
    isEmbeddingSimpleEnabled,
    tokenFeatures: {
      embedding_sdk: true,
      embedding_simple: true,
    },
    enterprisePlugins: ["embedding-sdk"],
  });

  expect(await screen.findByText("Security")).toBeInTheDocument();
};

describe("EmbeddingSecuritySettings", () => {
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
