import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { EnableEmbeddingCard } from "./EnableEmbeddingCard";

export const EnableGuestEmbedsCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isGuestEmbedsEnabled,
    isGuestEmbedsTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  if (isSimpleEmbedFeatureAvailable) {
    return null;
  }

  // Not yet fetched
  if (isGuestEmbedsEnabled === undefined) {
    return null;
  }

  return (
    <EnableEmbeddingCard
      embeddingType="guest embeds"
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
      errorMessage={t`Failed to enable guest embeds`}
    />
  );
};
