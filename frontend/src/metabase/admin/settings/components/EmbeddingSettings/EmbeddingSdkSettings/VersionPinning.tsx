import { t } from "ttag";

import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Button, Icon } from "metabase/ui";

import SettingHeader from "../../SettingHeader";

export const VersionPinning = () => (
  <Box>
    <SettingHeader
      id="version-pinning"
      setting={{
        display_name: t`Version pinning`,
        description: t`Metabase Cloud instances are automatically upgraded to new releases. SDK packages are strictly compatible with specific version of Metabase. You can request to pin your Metabase to a major version and upgrade your Metabase and SDK dependency in a coordinated fashion.`,
      }}
    />
    <Button
      compact
      variant="outline"
      leftIcon={<Icon size={12} name="mail" aria-hidden />}
      component={ExternalLink}
      fz="0.75rem"
      href="mailto:help@metabase.com"
    >{t`Request version pinning`}</Button>
  </Box>
);
