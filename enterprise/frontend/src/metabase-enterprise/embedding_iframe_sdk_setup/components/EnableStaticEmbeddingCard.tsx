import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase-enterprise/embedding_iframe_sdk_setup/context";

import { EmbeddingControlCard } from "./EmbeddingControlCard";

export const EnableStaticEmbeddingCard = () => {
  const {
    isSimpleEmbedFeatureAvailable,
    isStaticEmbeddingEnabled,
    isStaticEmbeddingTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  if (isSimpleEmbedFeatureAvailable) {
    return null;
  }

  return (
    <EmbeddingControlCard
      embeddingType="unauthenticated embeds"
      isEnabled={isStaticEmbeddingEnabled}
      termsAccepted={isStaticEmbeddingTermsAccepted}
      settingsToUpdate={{
        "enable-embedding-static": true,
        // When the simple embed feature is not available (oss), we toggle both static and simple embedding
        ...(!isSimpleEmbedFeatureAvailable && {
          "enable-embedding-simple": true,
        }),
        ...(!isStaticEmbeddingTermsAccepted && {
          "show-static-embed-terms": false,
        }),
      }}
      errorMessage={t`Failed to enable unauthenticated embedding`}
    />
  );
};
