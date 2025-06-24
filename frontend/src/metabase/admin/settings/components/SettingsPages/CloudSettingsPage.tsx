import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { ButtonLink } from "metabase/core/components/ExternalLink";
import { getStoreUrl } from "metabase/selectors/settings";
import { Icon } from "metabase/ui";

import { CloudPanel } from "../CloudPanel";
import { SettingHeader } from "../SettingHeader";
import { SettingsPageWrapper, SettingsSection } from "../SettingsSection";

export function CloudSettingsPage() {
  const isHosted = useHasTokenFeature("hosting");

  return (
    <SettingsPageWrapper title={t`Cloud`}>
      {isHosted ? <SettingsCloudStoreLink /> : <CloudPanel />}
    </SettingsPageWrapper>
  );
}

export const SettingsCloudStoreLink = () => {
  const url = getStoreUrl();

  return (
    <SettingsSection>
      <SettingHeader
        id="cloud-settings-header"
        title={t`Cloud settings`}
        description={t`Manage your Cloud account, including billing preferences and technical settings about this instance in your Metabase Store account.`}
      />
      <ButtonLink href={url}>
        {t`Go to the Metabase Store`}
        <Icon name="external" opacity={0.6} ml="sm" />
      </ButtonLink>
    </SettingsSection>
  );
};
