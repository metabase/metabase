import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Box, Stack } from "metabase/ui";

import { UPSELL_CAMPAIGN_EXPERIENCE } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { AuthenticationCard } from "../../AuthenticationCard";
import { EmbeddingUpsell } from "../../Common/EmbeddingUpsell";

import { ExperienceCard } from "./ExperienceCard";
import { ResourceCard } from "./ResourceCard";

export const SelectEmbedExperienceStep = () => {
  const { allowPreviewAndNavigation } = useSdkIframeEmbedSetupContext();

  // Authentication is interactive even when preview/navigation is disabled
  // (otherwise the user couldn't switch auth type or accept terms to unblock).
  const dimmedProps = {
    opacity: allowPreviewAndNavigation ? 1 : 0.5,
    className: cx(!allowPreviewAndNavigation && CS.pointerEventsNone),
  };

  return (
    <Stack gap="md">
      <Box {...dimmedProps}>
        <ExperienceCard />
      </Box>

      <AuthenticationCard />

      <Stack gap="md" {...dimmedProps}>
        <ResourceCard />
        <EmbeddingUpsell campaign={UPSELL_CAMPAIGN_EXPERIENCE} />
      </Stack>
    </Stack>
  );
};
