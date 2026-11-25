import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Box, Stack } from "metabase/ui";

import { UPSELL_CAMPAIGN_EXPERIENCE } from "../../../analytics";
import { useSdkIframeEmbedSetupContext } from "../../../context";
import { DataAppEnableEmbeddingCard } from "../../../data-apps/DataAppEnableEmbeddingCard";
import { hasAuthToSelect } from "../../../utils/has-auth-to-select";
import { hasResourceToSelect } from "../../../utils/has-resource-to-select";
import { AuthenticationCard } from "../../AuthenticationCard";
import { EmbeddingUpsell } from "../../Common/EmbeddingUpsell";

import { ExperienceCard } from "./ExperienceCard";
import { ResourceCard } from "./ResourceCard";

export const SelectEmbedExperienceStep = () => {
  const { allowPreviewAndNavigation, experience } =
    useSdkIframeEmbedSetupContext();

  const showAuth = hasAuthToSelect(experience);
  const showResource = hasResourceToSelect(experience);

  // Experience and authentication remain interactive so the user can switch
  // embed types or accept the terms to unblock setup.
  const dimmedProps = {
    opacity: allowPreviewAndNavigation ? 1 : 0.5,
    className: cx(!allowPreviewAndNavigation && CS.pointerEventsNone),
  };

  return (
    <Stack gap="lg">
      <ExperienceCard />

      {showAuth && <AuthenticationCard />}

      <DataAppEnableEmbeddingCard />

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
