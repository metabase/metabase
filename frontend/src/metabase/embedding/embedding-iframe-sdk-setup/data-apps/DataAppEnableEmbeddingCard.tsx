import { Card } from "metabase/ui";

import { EnableModularEmbeddingSection } from "../components/AuthenticationCard/EnableModularEmbeddingSection";
import { useSdkIframeEmbedSetupContext } from "../context";

/**
 * We don't have any auth options for data apps, so enabling modular
 * embeds must be shown inline, outside of AuthenticationCard.
 */
export const DataAppEnableEmbeddingCard = () => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  const showCard =
    experience === "data-app" &&
    isSimpleEmbedFeatureAvailable &&
    isSimpleEmbeddingEnabled !== undefined &&
    (!isSimpleEmbeddingEnabled || !isSimpleEmbeddingTermsAccepted);

  if (!showCard) {
    return null;
  }

  return (
    <Card p="lg">
      <EnableModularEmbeddingSection
        isEnabled={isSimpleEmbeddingEnabled}
        termsAccepted={isSimpleEmbeddingTermsAccepted}
        withIndent={false}
      />
    </Card>
  );
};
