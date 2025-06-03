import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { ButtonLink } from "metabase/core/components/ExternalLink";
import { getStoreUrl } from "metabase/selectors/settings";
import { Box, Icon, Text } from "metabase/ui";

import { CloudPanel } from "../CloudPanel";

export function CloudSettingsPage() {
  const isHosted = useHasTokenFeature("hosting");

  if (isHosted) {
    return <SettingsCloudStoreLink />;
  }

  return <CloudPanel />;
}

export const SettingsCloudStoreLink = () => {
  const url = getStoreUrl();

  return (
    <Box maw="30rem">
      {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
      <Text mb="sm">{t`Manage your Cloud account, including billing preferences and technical settings about this instance in your Metabase Store account.`}</Text>
      <ButtonLink href={url}>
        {/* eslint-disable-next-line no-literal-metabase-strings -- Metabase settings */}
        {t`Go to the Metabase Store`}
        <Icon name="external" opacity={0.6} ml="sm" />
      </ButtonLink>
    </Box>
  );
};
