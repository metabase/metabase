import { t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useAdminSetting } from "metabase/api/utils";
import { FormTextInput } from "metabase/forms";
import { Box } from "metabase/ui";

export function LdapUserProvisioning() {
  return (
    <Box mb="xl">
      <AdminSettingInput
        name="ldap-user-provisioning-enabled?"
        title={t`User provisioning`}
        inputType="boolean"
      />
    </Box>
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
