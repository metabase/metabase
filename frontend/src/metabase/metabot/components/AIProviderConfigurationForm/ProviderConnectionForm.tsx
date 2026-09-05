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
import { useSetting } from "metabase/settings";
import {
  Button,
  Collapse,
  Flex,
  Group,
  Icon,
  Select,
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
import { getHiddenFieldKeys, isVisibleField } from "./visible-fields";

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
  // On edit, start the picker on the model the connection is actually serving, not the type default.
  const modelRef = useSetting("llm-metabot-provider");
  const [model, setModel] = useState<string | undefined>(() => {
    const type = providerTypes.find(
      (option) => option.type === connection?.type,
    );
    const isOnCatalog = (id?: string | null): id is string =>
      type?.models.some((typeModel) => typeModel.id === id) ?? false;
    const [refKey, ...refModelParts] = (modelRef ?? "").split("/");
    const refModel = refModelParts.join("/");
    if (
      connection != null &&
      refKey === connection.key &&
      isOnCatalog(refModel)
    ) {
      return refModel;
    }
    // Metabot points elsewhere: fall back to the model this connection was last verified against.
    const probedModel = connection?.config?.["probed-model"];
    if (isOnCatalog(probedModel)) {
      return probedModel;
    }
    return type?.default_model ?? undefined;
  });
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
      setModel(selected.default_model ?? undefined);
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
    setModel(undefined);
    setError(undefined);
  };

  // A required field the registry gives a default is already satisfied — the form shows that value pre-selected,
  // and the backend fills it in for a connection that never touched it. A type with alternative credential
  // groups (Google: a service account key, or an OAuth token with a project ID) additionally needs one group
  // filled in full; its fields are individually optional because either group will do.
  const hasValue = (key: string) => (config[key] ?? "").trim() !== "";
  const isComplete =
    providerType != null &&
    providerType.fields
      .filter(
        (field) =>
          field.required &&
          !field.default &&
          isVisibleField(field, providerType.fields, config),
      )
      .every((field) => hasValue(field.key)) &&
    (providerType.required_any.length === 0 ||
      providerType.required_any.some((group) => group.every(hasValue)));

  const handleSave = async () => {
    if (!providerType) {
      return;
    }
    setError(undefined);
    // A field the form hid is not part of the connection: clearing it is what makes switching
    // Google's authentication method drop the credential the other one replaced.
    const cleared = getHiddenFieldKeys(providerType.fields, config).filter(
      (key) => (config[key] ?? "") !== "",
    );
    const savedConfig = {
      ...config,
      ...Object.fromEntries(cleared.map((key) => [key, ""])),
    };
    try {
      const saved = isEditing
        ? await updateProvider({
            key: connection.key,
            name,
            config: savedConfig,
            model,
          }).unwrap()
        : await createProvider({
            type: providerType.type,
            name,
            config: savedConfig,
            model,
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
    <Stack gap="xl">
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
            <Stack gap="xl">
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
            <Stack gap="xl">
              {!isEditing && <SelectedProvider providerType={selected} />}
              <ProviderConfigFields
                fields={primaryFields}
                values={config}
                onChange={(key, value) =>
                  setConfig((current) => ({ ...current, [key]: value }))
                }
                disabled={isSaving}
                disabledFields={connection?.env_fields}
                autoFocusFirstField
              />
              {selected.models.length > 0 && (
                <Select
                  label={t`Model`}
                  description={t`Connecting checks your credentials against this model, and Metabot starts on it.`}
                  data={selected.models.map(({ id, display_name }) => ({
                    value: id,
                    label: display_name,
                  }))}
                  value={model ?? null}
                  onChange={(next) => setModel(next ?? undefined)}
                  disabled={isSaving}
                />
              )}
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
                  disabledFields={connection?.env_fields}
                />
              </AdvancedSettings>
              {error && <Text c="error">{error}</Text>}
              <Flex justify="end">
                <Group gap="sm">
                  {match({ isEditing, onCancel })
                    .with(
                      { isEditing: true, onCancel: P.nonNullable },
                      ({ onCancel }) => (
                        <Button
                          type="button"
                          onClick={onCancel}
                          disabled={isSaving}
                        >
                          {t`Cancel`}
                        </Button>
                      ),
                    )
                    .with({ isEditing: false }, () => (
                      <Button
                        type="button"
                        onClick={handleBack}
                        disabled={isSaving}
                      >
                        {t`Back`}
                      </Button>
                    ))
                    .otherwise(() => null)}
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
    <Stack gap="lg">
      <Button
        type="button"
        variant="transparent"
        size="compact-md"
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
        <Stack gap="xl">{children}</Stack>
      </Collapse>
    </Stack>
  );
}

function SelectedProvider({ providerType }: { providerType: LlmProviderType }) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ProviderTypeIcon type={providerType.type} />
      <Text fw="bold">{providerType.label}</Text>
    </Group>
  );
}
