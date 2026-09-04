import { t } from "ttag";

import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useAdminSetting } from "metabase/settings";
import { Group, Stack, Switch, Text } from "metabase/ui";

export function ProviderFallbackSettings() {
  const {
    value: isFallbackEnabled,
    updateSetting,
    settingDetails,
    isLoading,
  } = useAdminSetting("llm-provider-fallback-enabled?");

  const isEnvSetting = !!settingDetails?.is_env_setting;
  const envVarName = isEnvSetting ? settingDetails?.env_name : undefined;

  const handleChange = async (checked: boolean) => {
    await updateSetting({
      key: "llm-provider-fallback-enabled?",
      value: checked,
    });
  };

  return (
    <Stack gap="xxs" data-testid="provider-fallback-settings">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Stack gap={0}>
          <Text fw="bold">{t`Fall back to the next provider`}</Text>
          <Text size="sm" c="text-secondary">
            {t`When a provider stops responding, Metabot moves down this list to the default model of the next one that works, and moves back up as soon as it recovers.`}
          </Text>
        </Stack>
        <Switch
          aria-label={t`Fall back to the next provider`}
          checked={!!isFallbackEnabled}
          disabled={isEnvSetting || isLoading}
          onChange={(event) => handleChange(event.target.checked)}
          size="sm"
          w="auto"
        />
      </Group>

      {envVarName && <SetByEnvVar varName={envVarName} />}
    </Stack>
  );
}
