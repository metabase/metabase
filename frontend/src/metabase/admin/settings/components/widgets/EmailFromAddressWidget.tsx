import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useHasTokenFeature, useSetting } from "metabase/common/hooks";
import { Box, Icon, TextInput } from "metabase/ui";

import { SettingHeader } from "../SettingHeader";

export function EmailFromAddressWidget() {
  const {
    value: initialValue,
    updateSetting,
    isLoading,
    description: settingDescription,
    settingDetails,
  } = useAdminSetting("email-from-address");
  const isHosted = useSetting("is-hosted?") || true;
  const isEnvSetting = settingDetails?.is_env_setting || true;
  const isCloudSMTPEnabled = useSetting("cloud-smtp-enabled");
  const isFromAddressManagedByMetabase =
    isHosted && isEnvSetting && !isCloudSMTPEnabled;
  const hasCloudCustomSMTPFeature = useHasTokenFeature("cloud-custom-smtp");

  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = () => {
    if (localValue === initialValue) {
      return;
    }

    updateSetting({
      key: "email-from-address",
      value: localValue ? localValue : null,
    });
  };

  if (isLoading) {
    return null;
  }

  return (
    <Box data-testid={`email-from-address-setting`}>
      <SettingHeader
        id={"email-from-address"}
        title={t`From Address`}
        description={
          isFromAddressManagedByMetabase
            ? t`Please set up a custom SMTP server to change this${hasCloudCustomSMTPFeature ? "" : t` (Pro only)`}`
            : settingDescription
        }
      />

      <TextInput
        id={"email-from-address"}
        value={localValue ? localValue : ""}
        placeholder={"metabase@yourcompany.com"}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => handleChange()}
        type={"text"}
        disabled={isFromAddressManagedByMetabase}
        rightSection={
          isFromAddressManagedByMetabase && <Icon name="lock" size={12} />
        }
      />
    </Box>
  );
}
