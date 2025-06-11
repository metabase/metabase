import { t } from "ttag";

import { UpsellSSO } from "metabase/admin/upsells";
import { useGetSettingsQuery } from "metabase/api";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Box, Flex, Stack, Title } from "metabase/ui";

import { ApiKeysAuthCard } from "../../auth/components/ApiKeysAuthCard";
import { GoogleAuthCard } from "../../auth/containers/GoogleAuthCard/GoogleAuthCard";
import { LdapAuthCard } from "../../auth/containers/LdapAuthCard";
import { ManageApiKeys } from "../ApiKeys/ManageApiKeys";

export function AuthenticationSettingsPage({ tab }: { tab: string }) {
  const hasSSO = useHasSso();

  if (hasSSO) {
    return <PLUGIN_AUTH_PROVIDERS.AuthSettingsPage tab={tab} />;
  }

  if (tab === "api-keys") {
    return <ManageApiKeys />;
  }

  return (
    <Box>
      <Title order={1} mb="md">{t`Authentication`}</Title>
      <Flex justify={"space-between"} gap="lg">
        <Stack gap="xl">
          <GoogleAuthCard />
          <LdapAuthCard />
          <ApiKeysAuthCard />
        </Stack>
        <Box style={{ flexShrink: 0 }}>
          <UpsellSSO source="authentication-sidebar" />
        </Box>
      </Flex>
    </Box>
  );
}

const useHasSso = () => {
  const { data: settings } = useGetSettingsQuery();

  const tokenFeatures = settings?.["token-features"];
  return hasAnySsoFeature(tokenFeatures);
};
