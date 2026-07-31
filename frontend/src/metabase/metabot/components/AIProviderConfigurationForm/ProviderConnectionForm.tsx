import { useDisclosure } from "@mantine/hooks";
import type { FormEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  useCreateLlmProviderMutation,
  useUpdateLlmProviderMutation,
} from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { PLUGIN_METABOT } from "metabase/plugins";
import {
  Button,
  Collapse,
  Flex,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import type {
  LlmProviderConfig,
  LlmProviderConnection,
  LlmProviderType,
} from "metabase-types/api";

import { ProviderConfigFields } from "./ProviderConfigFields";
import { ProviderTypeIcon } from "./ProviderTypeIcon";
import { ProviderTypePicker } from "./ProviderTypePicker";
import { findProviderTypeForApiKey } from "./api-key";

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

  const [primaryFields, advancedFields] = useMemo(() => {
    const fields = providerType?.fields ?? [];
    return [
      fields.filter((field) => !field.advanced),
      fields.filter((field) => field.advanced),
    ];
  }, [providerType]);

  const [isAdvancedOpen, { toggle: toggleAdvanced }] = useDisclosure(
    hasStoredAdvancedValues(providerType, connection),
  );

  const selectProviderType = useCallback(
    (selected: LlmProviderType, nextConfig: LlmProviderConfig = {}) => {
      setTypeName(selected.type);
      setName(selected.label);
      setConfig(nextConfig);
      setError(undefined);
    },
    [],
  );

  const handleTypeChange = (nextType: string) => {
    const selected = providerTypes.find((option) => option.type === nextType);
    if (selected) {
      selectProviderType(selected);
    }
  };

  const isPickingType = !isEditing && providerType == null;

  useEffect(() => {
    if (!isPickingType) {
      return;
    }
    const handlePaste = (event: ClipboardEvent) => {
      const pasted = event.clipboardData?.getData("text").trim();
      const match = pasted
        ? findProviderTypeForApiKey(providerTypes, pasted)
        : undefined;
      if (!pasted || !match) {
        return;
      }
      event.preventDefault();
      selectProviderType(match.providerType, { [match.fieldKey]: pasted });
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [isPickingType, providerTypes, selectProviderType]);

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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    handleSave();
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
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              {!isEditing && <SelectedProvider providerType={selected} />}
              <ProviderConfigFields
                fields={primaryFields}
                values={config}
                onChange={(key, value) =>
                  setConfig((current) => ({ ...current, [key]: value }))
                }
                disabled={isSaving}
                autoFocusFirstField
              />
              <AdvancedSettings
                isOpened={isAdvancedOpen}
                onToggle={toggleAdvanced}
              >
                <TextInput
                  label={t`Display name`}
                  description={t`What this connection is called in the model picker.`}
                  value={name}
                  onChange={(event) => setName(event.currentTarget.value)}
                  disabled={isSaving}
                />
                <ProviderConfigFields
                  fields={advancedFields}
                  values={config}
                  onChange={(key, value) =>
                    setConfig((current) => ({ ...current, [key]: value }))
                  }
                  disabled={isSaving}
                />
              </AdvancedSettings>
              {error && <Text c="error">{error}</Text>}
              <Flex justify="end">
                <Group gap="sm">
                  {isEditing ? (
                    onCancel && (
                      <Button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                      >
                        {t`Cancel`}
                      </Button>
                    )
                  ) : (
                    <Button
                      type="button"
                      onClick={handleBack}
                      disabled={isSaving}
                    >
                      {t`Back`}
                    </Button>
                  )}
                  <Button
                    type="submit"
                    variant="filled"
                    loading={isSaving}
                    disabled={isSaving || !isComplete}
                  >
                    {isEditing ? t`Save` : t`Connect`}
                  </Button>
                </Group>
              </Flex>
            </Stack>
          </form>
        ))
        .otherwise(() => null)}
    </Stack>
  );
}

function hasStoredAdvancedValues(
  providerType: LlmProviderType | undefined,
  connection: LlmProviderConnection | undefined,
) {
  return (providerType?.fields ?? []).some(
    (field) =>
      field.advanced && (connection?.config[field.key] ?? "").trim() !== "",
  );
}

function AdvancedSettings({
  isOpened,
  onToggle,
  children,
}: {
  isOpened: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <Stack gap="md">
      <Button
        type="button"
        variant="subtle"
        p={0}
        w="fit-content"
        aria-expanded={isOpened}
        onClick={onToggle}
        leftSection={
          <Icon name={isOpened ? "chevrondown" : "chevronright"} size={12} />
        }
      >
        {t`Advanced settings`}
      </Button>
      <Collapse in={isOpened}>
        <Stack gap="lg">{children}</Stack>
      </Collapse>
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
