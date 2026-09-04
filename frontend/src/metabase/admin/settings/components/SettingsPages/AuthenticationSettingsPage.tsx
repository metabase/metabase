import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { UpsellSSO } from "metabase/admin/upsells";
import {
  type AuthSettingsPageTab,
  PLUGIN_AUTH_PROVIDERS,
  PLUGIN_MULTI_FACTOR_AUTH,
} from "metabase/plugins";
import { hasAnySsoFeature, useGetSettingsQuery } from "metabase/settings";
import { Box, Flex, Stack } from "metabase/ui";

import { ApiKeysAuthCard } from "../../auth/components/ApiKeysAuthCard";
import { GoogleAuthCard } from "../../auth/containers/GoogleAuthCard/GoogleAuthCard";
import { LdapAuthCard } from "../../auth/containers/LdapAuthCard";
import { ManageApiKeys } from "../ApiKeys/ManageApiKeys";

export function AuthenticationSettingsPage({
  tab,
}: {
  tab: AuthSettingsPageTab;
}) {
  const hasSSO = useHasSso();

  if (hasSSO) {
    return <PLUGIN_AUTH_PROVIDERS.AuthSettingsPage tab={tab} />;
  }

  if (tab === "api-keys") {
    return <ManageApiKeys />;
  }

  return (
    <SettingsPageWrapper title={t`Authentication`}>
      <Flex justify={"space-between"} gap="xl">
        <Stack gap="xl">
          <GoogleAuthCard />
          <LdapAuthCard />
          <ApiKeysAuthCard />
          <PLUGIN_MULTI_FACTOR_AUTH.AdminAuthCard />
        </Stack>
        <Box style={{ flexShrink: 0 }}>
          <UpsellSSO location="authentication-sidebar" />
        </Box>
      </Flex>
    </SettingsPageWrapper>
  );
}

const useHasSso = () => {
  const { data: settings } = useGetSettingsQuery();

  const tokenFeatures = settings?.["token-features"];
  return hasAnySsoFeature(tokenFeatures);
};
