import { t } from "ttag";

import { GoogleAuthCard } from "metabase/admin/settings/auth/containers/GoogleAuthCard";
import { LdapAuthCard } from "metabase/admin/settings/auth/containers/LdapAuthCard";
import { ManageApiKeys } from "metabase/admin/settings/components/ApiKeys/ManageApiKeys";
import { SettingsSection } from "metabase/admin/settings/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Stack, Title } from "metabase/ui";

import { JwtAuthCard } from "../containers/JwtAuthCard";
import { SamlAuthCard } from "../containers/SamlAuthCard";
import { useHasSsoEnabled } from "../utils";

import { SessionTimeoutSetting } from "./SessionTimeoutSetting";

type Tabs = "authentication" | "user-provisioning" | "api-keys";

export function AuthSettingsPage({ tab = "authentication" }: { tab?: Tabs }) {
  if (tab === "api-keys") {
    return <ManageApiKeys />;
  }

  if (tab === "user-provisioning") {
    return <PLUGIN_AUTH_PROVIDERS.UserProvisioningSettings />;
  }

  return <AuthenticationTab />;
}

function AuthenticationTab() {
  const canDisablePasswordLogin = useHasTokenFeature("disable_password_login");
  const hasAnySsoProviderEnabled = useHasSsoEnabled();
  return (
    <Stack gap="xl" pb="xl">
      <Title order={1}>{t`Authentication`}</Title>
      <GoogleAuthCard />
      <LdapAuthCard />
      <SamlAuthCard />
      <JwtAuthCard />

      <SettingsSection>
        <AdminSettingInput
          hidden={!canDisablePasswordLogin || !hasAnySsoProviderEnabled}
          name="enable-password-login"
          inputType="boolean"
          title={t`Enable password authentication`}
          description={t`When enabled, users can additionally log in with email and password.`}
        />
        <SessionTimeoutSetting />
      </SettingsSection>
    </Stack>
  );
}
