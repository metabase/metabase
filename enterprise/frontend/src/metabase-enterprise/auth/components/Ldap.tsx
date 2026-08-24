import { t } from "ttag";

import { FormTextInput } from "metabase/forms";
import { useAdminSetting } from "metabase/settings";
import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import { SettingsSection } from "metabase/settings-components/SettingsSection";
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
      nullable
      {...getExtraFormFieldProps(settingDetails)}
    />
  );
}
