import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SetByEnvVar } from "metabase/common/components/SetByEnvVar";
import { useAdminSetting } from "metabase/settings";
import { AdminSettingInput } from "metabase/settings-components";
import { MultiSelect, Stack, Text } from "metabase/ui";

import { useListOAuthClientsQuery } from "../settings/api/oauth";

export function McpOAuthSettings() {
  const { value: rotationEnabled } = useAdminSetting(
    "oauth-server-rotate-refresh-tokens",
  );

  return (
    <Stack gap="md">
      <AdminSettingInput
        name="oauth-server-rotate-refresh-tokens"
        title={t`Refresh token rotation`}
        description={t`Replace refresh tokens after each use to limit reuse of stolen tokens. Keep this enabled to protect all clients, and add individual exceptions below when needed.`}
        inputType="boolean"
        switchLabel={t`Rotate refresh tokens`}
      />
      {rotationEnabled === false ? (
        <Text c="text-secondary" size="sm">
          {t`Rotation is disabled for all OAuth clients, including MCP and Agent API clients. Stolen refresh tokens can be reused until they expire or are revoked.`}
        </Text>
      ) : (
        <RefreshTokenExceptions />
      )}
    </Stack>
  );
}

function RefreshTokenExceptions() {
  const {
    value,
    settingDetails,
    updateSetting,
    updateSettingResult,
    isLoading: settingsLoading,
    isFetching,
    error: settingsError,
  } = useAdminSetting("oauth-server-refresh-token-reuse-client-ids");
  const {
    data: clients = [],
    isLoading,
    error,
  } = useListOAuthClientsQuery(undefined, { refetchOnMountOrArgChange: true });
  const selectedIds = settingDetails?.value ?? value ?? [];
  const options = clients.map(({ client_id, client_name }) => ({
    value: client_id,
    label: client_name ? `${client_name} (${client_id})` : client_id,
  }));
  const missingOptions = selectedIds
    .filter((id) => !clients.some((client) => client.client_id === id))
    .map((id) => ({ value: id, label: id }));

  return (
    <LoadingAndErrorWrapper
      loading={isLoading || settingsLoading}
      error={error ?? settingsError}
    >
      <Stack gap="sm">
        {settingDetails?.is_env_setting && settingDetails.env_name ? (
          <SetByEnvVar varName={settingDetails.env_name} />
        ) : (
          <MultiSelect
            label={t`Clients allowed to reuse refresh tokens`}
            description={t`Select the registered OpenAI or Codex connections that repeatedly ask you to reconnect. Exceptions apply only to the selected client IDs, not to other clients with the same name.`}
            placeholder={t`Select registered clients`}
            searchable
            clearable
            clearButtonProps={{
              "aria-label": t`Remove all token reuse exceptions`,
              "aria-hidden": false,
              tabIndex: 0,
            }}
            data={[...options, ...missingOptions]}
            value={selectedIds}
            disabled={updateSettingResult.isLoading || isFetching}
            nothingFoundMessage={t`No registered clients found. Connect your client to Metabase first.`}
            onChange={(clientIds) =>
              updateSetting({
                key: "oauth-server-refresh-token-reuse-client-ids",
                value: clientIds,
              })
            }
          />
        )}
        <Text c="text-secondary" size="sm">
          {t`For selected clients, stolen refresh tokens can be reused until they expire or are revoked. Expiry and permission checks still apply. If a connection is already broken, authorize it once more after adding the exception.`}
        </Text>
      </Stack>
    </LoadingAndErrorWrapper>
  );
}
