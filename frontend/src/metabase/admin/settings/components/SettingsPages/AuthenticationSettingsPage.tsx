import { UpsellSSO } from "metabase/admin/upsells";
import { useGetSettingsQuery } from "metabase/api";
import Breadcrumbs from "metabase/common/components/Breadcrumbs";
import { hasAnySsoFeature } from "metabase/common/utils/plan";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Box, Flex, Stack } from "metabase/ui";

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
    return (
      <Stack gap="lg" mx="md">
        <Breadcrumbs
          crumbs={[
            ["Authentication", "/admin/settings/authentication"],
            ["API Keys", "/admin/settings/authentication/api-keys"],
          ]}
        />
        <ManageApiKeys />
      </Stack>
    );
  }

  return (
    <Flex justify={"space-between"}>
      <Stack gap="xl" maw="42rem" px="lg" py="sm">
        <GoogleAuthCard />
        <LdapAuthCard />
        <ApiKeysAuthCard />
      </Stack>
      <Box style={{ flexShrink: 0 }}>
        <UpsellSSO source="authentication-sidebar" />
      </Box>
    </Flex>
  );
}

const useHasSso = () => {
  const { data: settings } = useGetSettingsQuery();

  const tokenFeatures = settings?.["token-features"];
  return hasAnySsoFeature(tokenFeatures);
};
