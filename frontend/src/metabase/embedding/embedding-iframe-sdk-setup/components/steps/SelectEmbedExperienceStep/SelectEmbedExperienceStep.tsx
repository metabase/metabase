import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Box, Card, Stack } from "metabase/ui";

import { UPSELL_CAMPAIGN_EXPERIENCE } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { hasAuthToSelect } from "../../../utils/has-auth-to-select";
import { hasResourceToSelect } from "../../../utils/has-resource-to-select";
import { AuthenticationCard } from "../../AuthenticationCard";
import { EnableModularEmbeddingSection } from "../../AuthenticationCard/EnableModularEmbeddingSection";
import { EmbeddingUpsell } from "../../Common/EmbeddingUpsell";

import { ExperienceCard } from "./ExperienceCard";
import { ResourceCard } from "./ResourceCard";

export const SelectEmbedExperienceStep = () => {
  const {
    allowPreviewAndNavigation,
    experience,
    isSimpleEmbedFeatureAvailable,
    isSimpleEmbeddingEnabled,
    isSimpleEmbeddingTermsAccepted,
  } = useSdkIframeEmbedSetupContext();

  const showAuth = hasAuthToSelect(experience);
  const showResource = hasResourceToSelect(experience);

  // Experience and authentication remain interactive so the user can switch
  // embed types or accept the terms to unblock setup.
  const dimmedProps = {
    opacity: allowPreviewAndNavigation ? 1 : 0.5,
    className: cx(!allowPreviewAndNavigation && CS.pointerEventsNone),
  };

  const showDataAppSetup =
    experience === "data-app" &&
    isSimpleEmbedFeatureAvailable &&
    isSimpleEmbeddingEnabled !== undefined &&
    (!isSimpleEmbeddingEnabled || !isSimpleEmbeddingTermsAccepted);

  return (
    <Stack gap="lg">
      <ExperienceCard />

      {showAuth && <AuthenticationCard />}

      {/* We don't have any auth options for data apps, so enabling modular
          embeds must be shown inline, outside of AuthenticationCard. */}
      {showDataAppSetup && (
        <Card p="lg">
          <EnableModularEmbeddingSection
            isEnabled={isSimpleEmbeddingEnabled}
            termsAccepted={isSimpleEmbeddingTermsAccepted}
            withIndent={false}
          />
        </Card>
      )}

      {showResource && (
        <Box {...dimmedProps}>
          <ResourceCard />
        </Box>
      )}

      <Box {...dimmedProps}>
        <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_EXPERIENCE} />
      </Box>
    </Stack>
  );
};
