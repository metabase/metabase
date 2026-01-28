import { t } from "ttag";

import { SettingsSection } from "metabase/admin/components/SettingsSection";
import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { FormTextInput } from "metabase/forms";
import { provisioningOptions } from "metabase-enterprise/auth/utils";

export function LdapUserProvisioning() {
  return (
    <SettingsSection>
      <AdminSettingInput
        name="ldap-user-provisioning-enabled?"
        title={t`User provisioning`}
        inputType="radio"
        options={provisioningOptions("LDAP")}
      />
    </SettingsSection>
  );
}

export function LdapGroupMembershipFilter() {
  const { settingDetails } = useAdminSetting("ldap-group-membership-filter");

  return (
    <FormTextInput
      name="ldap-group-membership-filter"
      label={t`Group membership filter`}
      description={settingDetails?.description}
      nullable
    />
  );
}
