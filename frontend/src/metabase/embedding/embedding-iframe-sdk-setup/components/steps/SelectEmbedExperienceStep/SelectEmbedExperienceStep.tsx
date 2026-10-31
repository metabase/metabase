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
  const showDataAppSetup =
    experience === "app" &&
    isSimpleEmbedFeatureAvailable &&
    isSimpleEmbeddingEnabled !== undefined &&
    (!isSimpleEmbeddingEnabled || !isSimpleEmbeddingTermsAccepted);

  // Authentication is interactive even when preview/navigation is disabled
  // (otherwise the user couldn't switch auth type or accept terms to unblock).
  const dimmedProps = {
    opacity: allowPreviewAndNavigation ? 1 : 0.5,
    className: cx(!allowPreviewAndNavigation && CS.pointerEventsNone),
  };

  return (
    <Stack gap="lg">
      <Box {...dimmedProps}>
        <ExperienceCard />
      </Box>

      {showAuth && <AuthenticationCard />}

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
