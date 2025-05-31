import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { Switch, type SwitchProps, Text } from "metabase/ui";

export type SwitchWithSetByEnvVarProps = {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive";
} & Omit<SwitchProps, "onChange">;

export function SwitchWithSetByEnvVar({
  settingKey,
  ...switchProps
}: SwitchWithSetByEnvVarProps) {
  const { value, settingDetails, updateSetting } = useAdminSetting(settingKey);

  if (settingDetails?.is_env_setting) {
    return (
      <Text c="var(--mb-color-text-secondary)">{t`Set via environment variable`}</Text>
    );
  }
  const isEnabled = Boolean(value);
  return (
    <Switch
      label={isEnabled ? t`Enabled` : t`Disabled`}
      size="sm"
      labelPosition="left"
      checked={isEnabled}
      wrapperProps={{
        "data-testid": "switch-with-env-var",
      }}
      {...switchProps}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        updateSetting({
          key: settingKey,
          value: event.currentTarget.checked,
        })
      }
    />
  );
}
