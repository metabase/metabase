import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { EnableEmbeddingCard } from "./EnableEmbeddingCard";

export const EnableEmbeddedAnalyticsCard = () => {
  const { isSimpleEmbeddingEnabled, isSimpleEmbeddingTermsAccepted } =
    useSdkIframeEmbedSetupContext();

  // Not yet fetched
  if (isSimpleEmbeddingEnabled === undefined) {
    return null;
  }

  return (
    <EnableEmbeddingCard
      embeddingType="modular embedding"
      isEnabled={isSimpleEmbeddingEnabled}
      termsAccepted={isSimpleEmbeddingTermsAccepted}
      settingsToUpdate={{
        "enable-embedding-simple": true,
        ...(!isSimpleEmbeddingTermsAccepted && {
          "show-simple-embed-terms": false,
        }),
      }}
      errorMessage={t`Failed to enable modular embedding`}
    />
  );
};
