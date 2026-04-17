import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { c, jt, t } from "ttag";

import { SetByEnvVar } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { useUpdateMetabotSettingsMutation } from "metabase/api";
import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Box, Button, Flex, TextInput } from "metabase/ui";

import {
  API_KEY_SETTING_BY_PROVIDER,
  type MetabotApiKeyProvider,
  getProviderOptions,
} from "./utils";

export function MetabotProviderApiKey({
  provider,
  error,
}: {
  provider: MetabotApiKeyProvider;
  error?: string | null;
}) {
  const selectedProvider = getProviderOptions(true)[provider];
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
      <Flex gap="md" align="flex-end">
        <TextInput
          key={selectedApiKeySetting}
          label={t`API key`}
          type="password"
          description={jt`Need a key? ${(
            <ExternalLink
              key={selectedProvider.value}
              href={selectedProvider.apiKey.addKeyUrl}
            >
              {c("{0} is the name of an AI provider")
                .t`Create one in ${selectedProvider.label}`}
            </ExternalLink>
          )}`}
          placeholder={
            selectedProvider.apiKey?.placeholder ?? t`Enter your API key`
          }
          value={displayValue}
          onChange={handleChange}
          error={displayError}
          disabled={isEnvSetting}
          w="100%"
        />
        {!isEnvSetting && (
          <Button
            onClick={handleConnect}
            disabled={!canConnect}
            loading={updateMetabotSettingsResult.isLoading}
            flex="1 0 auto"
            mb={displayError ? "1.35rem" : ""}
          >
            {t`Connect`}
          </Button>
        )}
      </Flex>
      {isEnvSetting && settingDetails?.env_name ? (
        <SetByEnvVar varName={settingDetails.env_name} />
      ) : null}
    </Box>
  );
}
