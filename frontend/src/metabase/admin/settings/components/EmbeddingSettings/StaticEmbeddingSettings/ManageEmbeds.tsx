import { t } from "ttag";

import { Box } from "metabase/ui";

import { SettingTitle } from "../../SettingHeader/SettingHeader.styled";
import { EmbeddedResources } from "../../widgets/PublicLinksListing";

export const ManageEmbeds = () => (
  <Box data-testid="embedded-resources">
    <SettingTitle>{t`Manage embeds`}</SettingTitle>
    <EmbeddedResources />
  </Box>
);
