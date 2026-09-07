import { t } from "ttag";

import { getExtraFormFieldProps } from "metabase/admin/settings/utils";
import { FormTextInput } from "metabase/forms";
import { useAdminSetting } from "metabase/settings";
import {
  AdminSettingInput,
  SettingsSection,
} from "metabase/settings-components";
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
