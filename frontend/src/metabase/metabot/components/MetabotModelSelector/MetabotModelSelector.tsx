import { skipToken } from "@reduxjs/toolkit/query";
import { useEffect, useMemo } from "react";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { useGetMetabotSettingsQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import { parseProviderAndModel } from "metabase/metabot/components/AIProviderConfigurationForm";
import { Icon, Loader, Select, type SelectOption } from "metabase/ui";

import S from "./MetabotModelSelector.module.css";

type ModelOption = SelectOption & {
  group?: string | null;
};

function getModelOptions(modelOptions: ModelOption[]) {
  const toSelectOption = ({ group, ...option }: ModelOption): SelectOption =>
    option;

  if (modelOptions.every((option) => !option.group)) {
    return modelOptions.map(toSelectOption);
  }

  const groupedModelOptions = new Map<string, SelectOption[]>();
  for (const option of modelOptions) {
    const group = option.group ?? t`Other`;
    groupedModelOptions.set(group, [
      ...(groupedModelOptions.get(group) ?? []),
      toSelectOption(option),
    ]);
  }

  return Array.from(groupedModelOptions, ([group, items]) => ({
    group,
    items,
  }));
}

type MetabotModelSelectorProps = {
  disabled?: boolean;
  dropdownPosition?: "top" | "bottom";
  modelOverride?: string;
  onModelOverrideChange: (model: string | undefined) => void;
};

export function MetabotModelSelector({
  disabled = false,
  dropdownPosition = "bottom",
  modelOverride,
  onModelOverrideChange,
}: MetabotModelSelectorProps) {
  const savedProviderValue = useSetting("llm-metabot-provider");
  const isModelSelectionEnabled =
    useSetting("llm-metabot-conversation-model-selection-enabled") !== false;
  const configuredModel = parseProviderAndModel(savedProviderValue);
  const showModelSelector =
    isModelSelectionEnabled && configuredModel?.provider !== "metabase";
  const { data, isLoading, error } = useGetMetabotSettingsQuery(
    showModelSelector ? {} : skipToken,
  );
  const defaultModel = savedProviderValue ?? undefined;
  const flatModelOptions = useMemo<ModelOption[]>(
    () =>
      (data?.models ?? []).map((model) => ({
        value: model.value,
        label: model.display_name,
        icon: model.original_provider,
        group: model.group,
      })),
    [data?.models],
  );
  const modelOptions = useMemo(
    () => getModelOptions(flatModelOptions),
    [flatModelOptions],
  );
  const selectedModel = modelOverride ?? defaultModel;
  const selectedModelOption = flatModelOptions.find(
    (option) => option.value === selectedModel,
  );

  useEffect(
    function switchToDefaultIfOverrideIsUnavailable() {
      if (
        modelOverride &&
        !error &&
        !isLoading &&
        (!showModelSelector || !selectedModelOption)
      ) {
        onModelOverrideChange(undefined);
      }
    },
    [
      error,
      isLoading,
      modelOverride,
      onModelOverrideChange,
      selectedModelOption,
      showModelSelector,
    ],
  );

  if (!showModelSelector) {
    return null;
  }

  return (
    <Select
      data-testid="metabot-model-selector"
      data={modelOptions}
      value={selectedModelOption?.value}
      onChange={(model) =>
        onModelOverrideChange(
          model === defaultModel ? undefined : (model ?? undefined),
        )
      }
      disabled={disabled || isLoading}
      placeholder={match({ error, isLoading })
        .with({ error: P.nonNullable }, (error) =>
          getErrorMessage(error, t`Error loading models`),
        )
        .with({ isLoading: true }, () => t`Loading...`)
        .otherwise(() => undefined)}
      leftSection={
        isLoading ? <Loader size="0.75rem" color="text-tertiary" /> : undefined
      }
      rightSection={<Icon size="0.5rem" name="chevrondown" />}
      leftSectionWidth={isLoading ? "1.25rem" : 0}
      rightSectionWidth="1rem"
      comboboxProps={{ position: dropdownPosition }}
      classNames={{
        root: S.modelSelectRoot,
        wrapper: S.modelSelectWrapper,
        input: S.modelSelectInput,
        section: S.modelSelectSection,
        dropdown: S.modelSelectDropdown,
        option: S.modelSelectOption,
      }}
    />
  );
}
