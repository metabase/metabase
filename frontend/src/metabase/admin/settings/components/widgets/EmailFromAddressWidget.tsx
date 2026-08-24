import { t } from "ttag";

import { UpsellEmailWhitelabelPill } from "metabase/admin/upsells";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useAdminSetting, useSetting } from "metabase/settings";
import { AdminSettingInput } from "metabase/settings-components/AdminSettingInput";
import { SettingHeader } from "metabase/settings-components/SettingHeader";
import { Box, Icon, TextInput } from "metabase/ui";

export function EmailFromAddressWidget() {
  const { value: fromAddressValue } = useAdminSetting("email-from-address");
  const isHosted = useSetting("is-hosted?");
  const isCloudSMTPEnabled = useSetting("smtp-override-enabled");
  const hasCloudCustomSMTPFeature = useHasTokenFeature("cloud_custom_smtp");

  if (!isHosted) {
    return (
      <AdminSettingInput
        title={t`From Address`}
        inputType="text"
        name="email-from-address"
      />
    );
  }

  if (isCloudSMTPEnabled) {
    return (
      <AdminSettingInput
        title={t`From Address`}
        inputType="text"
        name="email-from-address-override"
      />
    );
  }

  return (
    <Box data-testid={`email-from-address-setting`} pos="relative">
      <SettingHeader
        id={"email-from-address"}
        title={t`From Address`}
        description={t`Please set up a custom SMTP server to change this${hasCloudCustomSMTPFeature ? "" : t` (Pro only)`}`}
      />
      <Box pos="absolute" top={0} right={0}>
        <UpsellEmailWhitelabelPill source="settings-email" />
      </Box>

      <TextInput
        id={"email-from-address"}
        value={fromAddressValue ? fromAddressValue : ""}
        placeholder={"metabase@yourcompany.com"}
        type={"text"}
        disabled
        rightSection={<Icon name="lock" size={12} />}
      />
    </Box>
  );
}
