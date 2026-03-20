import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { c, jt, t } from "ttag";

import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Button, Stack, TextInput } from "metabase/ui";
import { useUpdateMetabotSettingsMutation } from "metabase-enterprise/api";
import type { MetabotProvider } from "metabase-types/api";

import { API_KEY_SETTING_BY_PROVIDER, PROVIDER_OPTIONS } from "./utils";

export function MetabotProviderApiKey({
  provider,
  error,
}: {
  provider: MetabotProvider;
  error?: string | null;
}) {
  const selectedProvider = PROVIDER_OPTIONS[provider];
  const selectedApiKeySetting = API_KEY_SETTING_BY_PROVIDER[provider];
  const { value, settingDetails } = useAdminSetting(selectedApiKeySetting);
  const [updateMetabotSettings, updateMetabotSettingsResult] =
    useUpdateMetabotSettingsMutation();
  const [localValue, setLocalValue] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const displayValue =
    localValue ?? String(settingDetails?.value ?? value ?? "");
  const savedValue = String(settingDetails?.value ?? value ?? "");
  const isEnvSetting = Boolean(
    settingDetails?.is_env_setting && settingDetails?.env_name,
  );
  const displayError = localError ?? (localValue == null ? error : null);
  const canConnect = useMemo(
    () => !isEnvSetting && localValue != null && localValue !== savedValue,
    [isEnvSetting, localValue, savedValue],
  );

  useEffect(() => {
    setLocalValue(null);
    setLocalError(null);
  }, [provider, settingDetails?.value]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    setLocalValue(event.target.value);
    setLocalError(null);
  };

  const handleConnect = async () => {
    if (!canConnect) {
      return;
    }

    try {
      await updateMetabotSettings({
        provider,
        "api-key": localValue || null,
      }).unwrap();
      setLocalError(null);
      setLocalValue(null);
    } catch (saveError) {
      setLocalError(getErrorMessage(saveError, t`Unable to verify API key.`));
    }
  };

  return (
    <Box>
      <Stack gap="md">
        <TextInput
          key={selectedApiKeySetting}
          label={t`API key`}
          type="password"
          description={jt`Need a key? ${(
            <ExternalLink
              key={selectedProvider.value}
              href={selectedProvider.addKeyUrl}
            >
              {c("{0} is the name of an AI provider")
                .t`Create one in ${selectedProvider.label}`}
            </ExternalLink>
          )}`}
          placeholder={
            selectedProvider.apiKeyPlaceholder ?? t`Enter your API key`
          }
          value={displayValue}
          onChange={handleChange}
          error={displayError}
          disabled={isEnvSetting}
        />
        {!isEnvSetting ? (
          <Button
            onClick={handleConnect}
            disabled={!canConnect}
            loading={updateMetabotSettingsResult.isLoading}
          >
            {t`Connect`}
          </Button>
        ) : null}
      </Stack>
      {isEnvSetting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : null}
    </Box>
  );
}
