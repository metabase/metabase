import type { ReactNode } from "react";

import { Card, Stack } from "metabase/ui";

import { EnableModularEmbeddingSection } from "../components/AuthenticationCard/EnableModularEmbeddingSection";
import { useSdkIframeEmbedSetupContext } from "../context";

interface Props {
  /**
   * Shown above the enable section. It stays in the card after embedding is
   * enabled, so it lines up with the rest of the card content either way.
   */
  alert?: ReactNode;
}

/**
 * We don't have any auth options for data apps, so enabling modular
 * embeds must be shown inline, outside of AuthenticationCard.
 */
export const DataAppEnableEmbeddingCard = ({ alert }: Props) => {
  const {
    experience,
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  const showEnableSection =
    experience === "data-app" &&
    isSimpleEmbedFeatureAvailable &&
    isSimpleEmbeddingEnabled !== undefined &&
    (!isSimpleEmbeddingEnabled || !isSimpleEmbeddingTermsAccepted);

  if (!showEnableSection && !alert) {
    return null;
  }

  return (
    <Card p="lg">
      <Stack gap="lg">
        {alert}

        {showEnableSection && (
          <EnableModularEmbeddingSection
            isEnabled={isSimpleEmbeddingEnabled}
            termsAccepted={isSimpleEmbeddingTermsAccepted}
            withIndent={false}
          />
        )}
      </Stack>
    </Card>
  );
};
