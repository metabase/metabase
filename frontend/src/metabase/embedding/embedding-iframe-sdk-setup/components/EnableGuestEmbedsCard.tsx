import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { EmbeddingControlCard } from "./EmbeddingControlCard";

export const EnableGuestEmbedsCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  if (isSimpleEmbedFeatureAvailable) {
    return null;
  }

  return (
    <EmbeddingControlCard
      embeddingType="Guest embeds"
      isEnabled={isGuestEmbedsEnabled}
      termsAccepted={isGuestEmbedsTermsAccepted}
      settingsToUpdate={{
        "enable-embedding-static": true,
        // When the simple embed feature is not available (oss), we toggle both static and simple embedding
        ...(!isSimpleEmbedFeatureAvailable && {
          "enable-embedding-simple": true,
        }),
        ...(!isGuestEmbedsTermsAccepted && {
          "show-static-embed-terms": false,
        }),
      }}
      errorMessage={t`Failed to enable Guest embeds`}
    />
  );
};
