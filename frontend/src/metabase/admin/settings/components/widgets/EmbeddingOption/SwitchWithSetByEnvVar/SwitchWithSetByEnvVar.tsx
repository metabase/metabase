import type { ComponentProps } from "react";
import { t } from "ttag";

import { Switch, Text } from "metabase/ui";

import { useEmbeddingSetting } from "../../../EmbeddingSettings/hooks";

interface SwitchWithSetByEnvVarProps extends ComponentProps<typeof Switch> {
  settingKey:
    | "enable-embedding-static"
    | "enable-embedding-sdk"
    | "enable-embedding-interactive";
}

export function SwitchWithSetByEnvVar({
  settingKey,
  ...switchProps
}: SwitchWithSetByEnvVarProps) {
  const [setting, handleChange] = useEmbeddingSetting({ key: settingKey });

  if (setting.is_env_setting) {
    return (
      <Text
        ml="auto"
        color="var(--mb-color-text-secondary)"
      >{t`Set via environment variable`}</Text>
    );
  }

  const isEnabled = Boolean(setting.value);
  return (
    <Switch
      {...switchProps}
      label={isEnabled ? t`Enabled` : t`Disabled`}
      size="sm"
      ml="auto"
      labelPosition="left"
      checked={isEnabled}
      disabled={setting.is_env_setting ? true : switchProps.disabled}
      onChange={event => handleChange(event.currentTarget.checked)}
    />
  );
}
