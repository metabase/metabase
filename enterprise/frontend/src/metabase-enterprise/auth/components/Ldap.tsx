import { t } from "ttag";

import {
  getDefaultPlaceholder,
  getExtraFormFieldProps,
} from "metabase/admin/settings/utils";
import { FormTextInput } from "metabase/forms";
import { useAdminSetting } from "metabase/settings";
import { UserProvisioningSection } from "metabase-enterprise/auth/components/UserProvisioningSection";

export function LdapUserProvisioning() {
  return (
    <UserProvisioningSection
      settingKey="ldap-user-provisioning-enabled?"
      providerName="LDAP"
    />
  );
}

export function LdapGroupMembershipFilter() {
  const { settingDetails } = useAdminSetting("ldap-group-membership-filter");

  return (
    <FormTextInput
      name="ldap-group-membership-filter"
      label={t`Group membership filter`}
      placeholder={getDefaultPlaceholder(settingDetails)}
      nullable
      {...getExtraFormFieldProps(settingDetails)}
    />
  );
}
