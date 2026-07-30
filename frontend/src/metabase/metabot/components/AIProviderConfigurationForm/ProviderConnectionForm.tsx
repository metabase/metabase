import { useMemo, useState } from "react";
import { P, match } from "ts-pattern";
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
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { ProviderTypePicker } from "./ProviderTypePicker";

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

  const handleBack = () => {
    setTypeName(undefined);
    setName("");
    setConfig({});
    setError(undefined);
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
      {match({ isEditing, providerType })
        .with({ isEditing: false, providerType: P.nullish }, () => (
          <ProviderTypePicker
            providerTypes={providerTypes}
            onSelect={handleTypeChange}
          />
        ))
        .with(
          { providerType: { managed: true } },
          ({ providerType: selected }) => (
            <Stack gap="lg">
              {!isEditing && <SelectedProvider providerType={selected} />}
              <MetabaseAIProviderSetup
                isConnected={isEditing}
                onConnect={() => onSaved()}
                onCancel={isEditing ? undefined : handleBack}
              />
            </Stack>
          ),
        )
        .with({ providerType: P.nonNullable }, ({ providerType: selected }) => (
          <Stack gap="lg">
            {!isEditing && <SelectedProvider providerType={selected} />}
            <TextInput
              label={t`Display name`}
              description={t`What this connection is called in the model picker.`}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              disabled={isSaving}
            />
            <ProviderConfigFields
              fields={selected.fields}
              values={config}
              onChange={(key, value) =>
                setConfig((current) => ({ ...current, [key]: value }))
              }
              disabled={isSaving}
            />
            {error && <Text c="error">{error}</Text>}
            <Flex justify="end">
              <Group gap="sm">
                {isEditing ? (
                  onCancel && (
                    <Button onClick={onCancel} disabled={isSaving}>
                      {t`Cancel`}
                    </Button>
                  )
                ) : (
                  <Button onClick={handleBack} disabled={isSaving}>
                    {t`Back`}
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
          </Stack>
        ))
        .otherwise(() => null)}
    </Stack>
  );
}

function SelectedProvider({ providerType }: { providerType: LlmProviderType }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ProviderTypeIcon type={providerType.type} icon={providerType.icon} />
      <Stack gap={0}>
        <Text fw="bold">{providerType.label}</Text>
        <Text c="text-secondary" size="sm">{t`Selected provider`}</Text>
      </Stack>
    </Group>
  );
}
