import { t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ButtonLink } from "metabase/common/components/ExternalLink";
import { useHasTokenFeature, useStoreUrl } from "metabase/common/hooks";
import { Box, Icon } from "metabase/ui";

import { CloudPanel } from "../CloudPanel";
import { SettingHeader } from "../SettingHeader";

export function CloudSettingsPage() {
  const isHosted = useHasTokenFeature("hosting");

  return (
    <SettingsPageWrapper title={t`Cloud`}>
      {isHosted ? <SettingsCloudStoreLink /> : <CloudPanel />}
    </SettingsPageWrapper>
  );
}

export const SettingsCloudStoreLink = () => {
  const url = useStoreUrl();

  return (
    <SettingsSection>
      <SettingHeader
        id="cloud-settings-header"
        title={t`Cloud settings`}
        description={t`Manage your Cloud account, including billing preferences and technical settings about this instance in your Metabase Store account.`}
      />
      <Box>
        <ButtonLink href={url}>
          {t`Go to the Metabase Store`}
          <Icon name="external" opacity={0.6} ml="sm" />
        </ButtonLink>
      </Box>
    </SettingsSection>
  );
};
