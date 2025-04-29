import { push } from "react-router-redux";
import { t } from "ttag";

import { GoogleAuthCard } from "metabase/admin/settings/auth/containers/GoogleAuthCard";
import { LdapAuthCard } from "metabase/admin/settings/auth/containers/LdapAuthCard";
import { ManageApiKeys } from "metabase/admin/settings/components/ApiKeys/ManageApiKeys";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_AUTH_PROVIDERS } from "metabase/plugins";
import { Stack, Tabs } from "metabase/ui";

import { JwtAuthCard } from "../containers/JwtAuthCard";
import { SamlAuthCard } from "../containers/SamlAuthCard";
import { useHasSsoEnabled } from "../utils";

import { SessionTimeoutSetting } from "./SessionTimeoutSetting";

type Tabs = "authentication" | "user-provisioning" | "api-keys";

export function AuthSettingsPage({ tab = "authentication" }: { tab?: Tabs }) {
  const dispatch = useDispatch();

  const handleTabChange = (newTab: Tabs | "") => {
    dispatch(push(`/admin/settings/authentication/${newTab}`));
  };

  const hasScim = useHasTokenFeature("scim");

  return (
    <Tabs mx="md" value={tab} maw="80rem">
      <Tabs.List mb="lg">
        <Tabs.Tab value="authentication" onClick={() => handleTabChange("")}>
          {t`Authentication`}
        </Tabs.Tab>
        {hasScim && (
          <Tabs.Tab
            value="user-provisioning"
            onClick={() => handleTabChange("user-provisioning")}
          >
            {t`User Provisioning`}
          </Tabs.Tab>
        )}
        <Tabs.Tab value="api-keys" onClick={() => handleTabChange("api-keys")}>
          {t`API Keys`}
        </Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="authentication">
        <AuthenticationTab />
      </Tabs.Panel>
      <Tabs.Panel value="user-provisioning">
        <PLUGIN_AUTH_PROVIDERS.UserProvisioningSettings />
      </Tabs.Panel>
      <Tabs.Panel value="api-keys">
        <ManageApiKeys />
      </Tabs.Panel>
    </Tabs>
  );
}

function AuthenticationTab() {
  const canDisablePasswordLogin = useHasTokenFeature("disable_password_login");
  const hasAnySsoProviderEnabled = useHasSsoEnabled();
  return (
    <Stack gap="xl" pb="xl">
      <GoogleAuthCard />
      <LdapAuthCard />
      <SamlAuthCard />
      <JwtAuthCard />

      <AdminSettingInput
        hidden={!canDisablePasswordLogin || !hasAnySsoProviderEnabled}
        name="enable-password-login"
        inputType="boolean"
        title={t`Enable password Authentication`}
        description={t`When enabled, users can additionally log in with email and password.`}
      />
      <SessionTimeoutSetting />
    </Stack>
  );
}
