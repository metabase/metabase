import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
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

  const isFromAddressManagedByMetabase = isHosted && isEnvSetting;

  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = (newValue: any) => {
    setLocalValue(newValue);
    if (newValue === initialValue) {
      return;
    }

    updateSetting({ key: "email-from-address", value: newValue });
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
            ? t`Please set up a custom SMTP server to change this`
            : settingDescription
        }
      />

      <TextInput
        id={"email-from-address"}
        value={initialValue ? initialValue : "noreply@metabase.com"}
        placeholder={"metabase@yourcompany.com"}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={() => handleChange(localValue)}
        type={"text"}
        disabled={isFromAddressManagedByMetabase}
        rightSection={
          isFromAddressManagedByMetabase && <Icon name="lock" size={12} />
        }
      />
    </Box>
  );
}
