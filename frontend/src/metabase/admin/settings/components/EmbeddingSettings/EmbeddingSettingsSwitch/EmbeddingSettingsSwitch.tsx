import { t } from "ttag";

import { Switch, Text } from "metabase/ui";
import type { SettingKey } from "metabase-types/api";

import { useEmbeddingSetting } from "../hooks";

export const EmbeddingSettingsSwitch = ({
  settingKey,
  switchLabel,
}: {
  settingKey: SettingKey;
  switchLabel: string;
}) => {
  const [setting, handleChange] = useEmbeddingSetting({ key: settingKey });
  const isSettingEnabled = Boolean(setting.value);

  return setting.is_env_setting ? (
    <Text color="var(--mb-color-text-secondary)">{t`Set via environment variable`}</Text>
  ) : (
    <Switch
      label={switchLabel}
      labelPosition="left"
      size="sm"
      checked={isSettingEnabled}
      onChange={event => handleChange(event.currentTarget.checked)}
    />
  );
};
