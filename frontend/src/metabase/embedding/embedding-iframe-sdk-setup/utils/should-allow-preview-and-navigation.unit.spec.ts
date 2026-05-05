import { shouldAllowPreviewAndNavigation } from "./should-allow-preview-and-navigation";

describe("shouldAllowPreviewAndNavigation", () => {
  const defaultParams = {
    isGuestEmbed: false,
    isGuestEmbedsEnabled: false,
    isGuestEmbedsTermsAccepted: false,
    isSimpleEmbedFeatureAvailable: false,
    isSimpleEmbeddingEnabled: false,
    isSimpleEmbeddingTermsAccepted: false,
  };

  describe("when Guest auth type is selected", () => {
    it("should return true when guest embeds are enabled and terms are accepted", () => {
      expect(
        shouldAllowPreviewAndNavigation({
          ...defaultParams,
          isGuestEmbed: true,
          isGuestEmbedsEnabled: true,
          isGuestEmbedsTermsAccepted: true,
        }),
      ).toBe(true);
    });

    it("should return false when guest embeds are not enabled", () => {
      expect(
        shouldAllowPreviewAndNavigation({
          ...defaultParams,
          isGuestEmbed: true,
          isGuestEmbedsEnabled: false,
          isGuestEmbedsTermsAccepted: true,
        }),
      ).toBe(false);
    });

    it("should return false when terms are not accepted", () => {
      expect(
        shouldAllowPreviewAndNavigation({
          ...defaultParams,
          isGuestEmbed: true,
          isGuestEmbedsEnabled: true,
          isGuestEmbedsTermsAccepted: false,
        }),
      ).toBe(false);
    });

    it("should return false when neither enabled nor terms accepted", () => {
      expect(
        shouldAllowPreviewAndNavigation({
          ...defaultParams,
          isGuestEmbed: true,
          isGuestEmbedsEnabled: false,
          isGuestEmbedsTermsAccepted: false,
        }),
      ).toBe(false);
    });
  });

  describe("when Metabase Account auth type is selected", () => {
    describe("when simple embed feature is available", () => {
      it("should return true when simple embedding is enabled and terms are accepted", () => {
        expect(
          shouldAllowPreviewAndNavigation({
            ...defaultParams,
            isGuestEmbed: false,
            isSimpleEmbedFeatureAvailable: true,
            isSimpleEmbeddingEnabled: true,
            isSimpleEmbeddingTermsAccepted: true,
          }),
        ).toBe(true);
      });

      it("should return false when simple embedding is not enabled", () => {
        expect(
          shouldAllowPreviewAndNavigation({
            ...defaultParams,
            isGuestEmbed: false,
            isSimpleEmbedFeatureAvailable: true,
            isSimpleEmbeddingEnabled: false,
            isSimpleEmbeddingTermsAccepted: true,
          }),
        ).toBe(false);
      });

      it("should return false when terms are not accepted", () => {
        expect(
          shouldAllowPreviewAndNavigation({
            ...defaultParams,
            isGuestEmbed: false,
            isSimpleEmbedFeatureAvailable: true,
            isSimpleEmbeddingEnabled: true,
            isSimpleEmbeddingTermsAccepted: false,
          }),
        ).toBe(false);
      });

      it("should return false when neither enabled nor terms accepted", () => {
        expect(
          shouldAllowPreviewAndNavigation({
            ...defaultParams,
            isGuestEmbed: false,
            isSimpleEmbedFeatureAvailable: true,
            isSimpleEmbeddingEnabled: false,
            isSimpleEmbeddingTermsAccepted: false,
          }),
        ).toBe(false);
      });
    });

    describe("when simple embed feature is not available", () => {
      it("should return false regardless of other flags", () => {
        expect(
          shouldAllowPreviewAndNavigation({
            ...defaultParams,
            isGuestEmbed: false,
            isSimpleEmbedFeatureAvailable: false,
            isSimpleEmbeddingEnabled: true,
            isSimpleEmbeddingTermsAccepted: true,
          }),
        ).toBe(false);
      });
    });
  });
});
