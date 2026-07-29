import { useMemo, useState } from "react";
import { t } from "ttag";

import {
  useCreateLlmProviderMutation,
  useUpdateLlmProviderMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { PLUGIN_METABOT } from "metabase/plugins";
import { Button, Flex, Group, Stack, Text, TextInput } from "metabase/ui";
import type {
  LlmProviderConfig,
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { ProviderConfigFields } from "./ProviderConfigFields";
import { ProviderTypeSelect } from "./ProviderTypeSelect";

export function ProviderConnectionForm({
  providerTypes,
  connection,
  onSaved,
  onCancel,
}: {
  providerTypes: LlmProviderType[];
  connection?: LlmProviderConnection;
  onSaved: (connection?: LlmProviderConnection) => void;
  onCancel?: () => void;
}) {
  const isEditing = connection != null;
  const [typeName, setTypeName] = useState<string | undefined>(
    connection?.type,
  );
  const [name, setName] = useState(connection?.name ?? "");
  const [config, setConfig] = useState<LlmProviderConfig>(
    connection?.config ?? {},
  );
  const [error, setError] = useState<string | undefined>();

  const [createProvider, createResult] = useCreateLlmProviderMutation();
  const [updateProvider, updateResult] = useUpdateLlmProviderMutation();
  const isSaving = createResult.isLoading || updateResult.isLoading;

  const providerType = useMemo(
    () => providerTypes.find((option) => option.type === typeName),
    [providerTypes, typeName],
  );

  const handleTypeChange = (nextType: string) => {
    setTypeName(nextType);
    setError(undefined);
    const nextProviderType = providerTypes.find(
      (option) => option.type === nextType,
    );
    setName(nextProviderType?.label ?? "");
    setConfig({});
  };

  const isComplete =
    providerType != null &&
    providerType.fields
      .filter((field) => field.required)
      .every((field) => (config[field.key] ?? "").trim() !== "");

  const handleSave = async () => {
    if (!providerType) {
      return;
    }
    setError(undefined);
    try {
      const saved = isEditing
        ? await updateProvider({ key: connection.key, name, config }).unwrap()
        : await createProvider({
            type: providerType.type,
            name,
            config,
          }).unwrap();
      onSaved(saved);
    } catch (caught) {
      setError(getErrorMessage(caught, t`Unable to save this provider.`));
    }
  };

  const MetabaseAIProviderSetup = PLUGIN_METABOT.MetabaseAIProviderSetup;

  return (
    <Stack gap="lg">
      {!isEditing && (
        <ProviderTypeSelect
          providerTypes={providerTypes}
          value={typeName}
          onChange={handleTypeChange}
        />
      )}

      {providerType?.managed ? (
        <MetabaseAIProviderSetup onConnect={() => onSaved()} />
      ) : (
        providerType && (
          <>
            <TextInput
              label={t`Display name`}
              description={t`What this connection is called in the model picker.`}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              disabled={isSaving}
            />
            <ProviderConfigFields
              fields={providerType.fields}
              values={config}
              onChange={(key, value) =>
                setConfig((current) => ({ ...current, [key]: value }))
              }
              disabled={isSaving}
            />
            {error && <Text c="error">{error}</Text>}
            <Flex justify="end">
              <Group gap="sm">
                {onCancel && (
                  <Button onClick={onCancel} disabled={isSaving}>
                    {t`Cancel`}
                  </Button>
                )}
                <Button
                  variant="filled"
                  loading={isSaving}
                  disabled={isSaving || !isComplete}
                  onClick={handleSave}
                >
                  {isEditing ? t`Save` : t`Connect`}
                </Button>
              </Group>
            </Flex>
          </>
        )
      )}
    </Stack>
  );
}
