import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { Box, Icon, TextInput } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

import { AdminSettingInput } from "./AdminSettingInput";

export function EmailFromAddressWidget() {
  const { value: fromAddressValue, settingDetails } =
    useAdminSetting("email-from-address");
  const isHosted = useSetting("is-hosted?");
  const isEnvSetting = settingDetails?.is_env_setting;
  const isCloudSMTPEnabled = useSetting("cloud-smtp-enabled");
  const hasCloudCustomSMTPFeature = useHasTokenFeature("cloud-custom-smtp");

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
        name="cloud-email-from-address"
      />
    );
  }

  if (isEnvSetting) {
    return (
      <Box data-testid={`email-from-address-setting`}>
        <SettingHeader
          id={"email-from-address"}
          title={t`From Address`}
          description={t`Please set up a custom SMTP server to change this${hasCloudCustomSMTPFeature ? "" : t` (Pro only)`}`}
        />

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

  return null;
}
