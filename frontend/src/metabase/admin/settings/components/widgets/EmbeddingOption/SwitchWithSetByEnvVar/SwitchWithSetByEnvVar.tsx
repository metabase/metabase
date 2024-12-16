import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useMergeSetting } from "metabase/common/hooks";
import { Switch, type SwitchProps, Text } from "metabase/ui";

export type SwitchWithSetByEnvVarProps = {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive";
  onChange: (value: boolean) => void;
} & Omit<SwitchProps, "onChange">;

export function SwitchWithSetByEnvVar({
  settingKey,
  onChange,
  ...switchProps
}: SwitchWithSetByEnvVarProps) {
  const setting = useMergeSetting({ key: settingKey });

  if (setting.is_env_setting) {
    return (
      <Text color="var(--mb-color-text-secondary)">{t`Set via environment variable`}</Text>
    );
  }
  const isEnabled = Boolean(setting.value);
  return (
    <Switch
      label={isEnabled ? t`Enabled` : t`Disabled`}
      size="sm"
      labelPosition="left"
      checked={isEnabled}
      wrapperProps={{
        "data-testid": "switch-with-env-var",
      }}
      onChange={(event: ChangeEvent<HTMLInputElement>) =>
        onChange(event.currentTarget.checked)
      }
      {...switchProps}
    />
  );
}
