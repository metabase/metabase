export const shouldAllowPreviewAndNavigation = ({
  isGuestEmbed,
  isGuestEmbedsEnabled,
  isGuestEmbedsTermsAccepted,
  isSimpleEmbedFeatureAvailable,
  isSimpleEmbeddingEnabled,
  isSimpleEmbeddingTermsAccepted,
}: {
  isGuestEmbed: boolean;
  isGuestEmbedsEnabled: boolean;
  isGuestEmbedsTermsAccepted: boolean;
  isSimpleEmbedFeatureAvailable: boolean;
  isSimpleEmbeddingEnabled: boolean;
  isSimpleEmbeddingTermsAccepted: boolean;
}) => {
  if (isGuestEmbed) {
    return isGuestEmbedsEnabled && isGuestEmbedsTermsAccepted;
  }

  return isSimpleEmbedFeatureAvailable
    ? isSimpleEmbeddingEnabled && isSimpleEmbeddingTermsAccepted
    : // For Metabase Account SSO auth type we disable navigation/preview as this auth type is non-supported in OSS/Starter editions
      false;
};
