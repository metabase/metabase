import { t } from "ttag";

import { useGetSetSetting } from "metabase/common/hooks";
import { Switch, type SwitchProps, Text } from "metabase/ui";

export type SwitchWithSetByEnvVarProps = {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive";
} & SwitchProps;

export function SwitchWithSetByEnvVar({
  settingKey,
  ...switchProps
}: SwitchWithSetByEnvVarProps) {
  const [setting, handleChange] = useGetSetSetting({ key: settingKey });

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
      onChange={event => handleChange(event.currentTarget.checked)}
      wrapperProps={{
        "data-testid": "switch-with-env-var",
      }}
      {...switchProps}
    />
  );
}
