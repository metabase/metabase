import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { EmbeddingControlCard } from "./EmbeddingControlCard";

export const EnableEmbeddedAnalyticsCard = () => {
  const { isSimpleEmbeddingEnabled, isSimpleEmbeddingTermsAccepted } =
    useSdkIframeEmbedSetupContext();

  return (
    <EmbeddingControlCard
      embeddingType="Embedded Analytics JS"
      isEnabled={isSimpleEmbeddingEnabled}
      termsAccepted={isSimpleEmbeddingTermsAccepted}
      settingsToUpdate={{
        "enable-embedding-simple": true,
        // accept the terms for Embedded Analytics JS
        "show-simple-embed-terms": false,
        ...(!isSimpleEmbeddingTermsAccepted && {
          "show-simple-embed-terms": false,
        }),
      }}
      errorMessage={t`Failed to enable Embedded Analytics JS`}
    />
  );
};
