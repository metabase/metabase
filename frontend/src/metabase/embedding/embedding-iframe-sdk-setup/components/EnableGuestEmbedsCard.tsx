import { t } from "ttag";

import { useSdkIframeEmbedSetupContext } from "metabase/embedding/embedding-iframe-sdk-setup/context";

import { EnableEmbeddingCard } from "./EnableEmbeddingCard";

export const EnableGuestEmbedsCard = () => {
  const { isGuestEmbedsEnabled, isGuestEmbedsTermsAccepted } =
    useSdkIframeEmbedSetupContext();

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
        ...(!isGuestEmbedsTermsAccepted && {
          "show-static-embed-terms": false,
        }),
      }}
      errorMessage={t`Failed to enable guest embeds`}
    />
  );
};
