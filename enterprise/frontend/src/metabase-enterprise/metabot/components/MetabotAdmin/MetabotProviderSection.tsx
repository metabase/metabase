import { useEffect, useMemo, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { getErrorMessage, useAdminSetting } from "metabase/api/utils";
import { useSetting } from "metabase/common/hooks";
import {
  Badge,
  Box,
  Button,
  type ComboboxItem,
  Group,
  Select,
  SelectItem,
  Stack,
  Text,
} from "metabase/ui";
import { useListMetabotModelPresetsQuery } from "metabase-enterprise/api";
import type {
  MetabotModelPreset,
  MetabotModelPriority,
  MetabotProvider,
} from "metabase-types/api";

import { MetabotProviderApiKey } from "./MetabotProviderApiKey";
import { PROVIDER_OPTIONS } from "./utils";

type MetabotModelPresetOption = ComboboxItem & {
  priority: MetabotModelPriority;
  display_name: string;
};

export function MetabotProviderSection() {
  const {
    value: savedProviderValue,
    updateSetting,
    updateSettingResult,
  } = useAdminSetting("ee-ai-metabot-provider");

  const { provider: savedProvider, model: savedModel } = useMemo(
    () => parseProviderAndModel(savedProviderValue),
    [savedProviderValue],
  );

  const isConfigured = useSetting("ee-ai-metabot-configured?");
  const modelPresetsQuery = useListMetabotModelPresetsQuery();
  const { data: modelPresetsResponse } = modelPresetsQuery;
  const savedProviderPresets = useMemo(
    () => getProviderPresets(modelPresetsResponse?.providers, savedProvider),
    [modelPresetsResponse?.providers, savedProvider],
  );
  const savedModelInputValue = useMemo(
    () => getModelInputValue(savedProviderPresets, savedModel),
    [savedModel, savedProviderPresets],
  );

  const [provider, setProvider] = useState<MetabotProvider | null>(
    savedProvider,
  );
  const [modelInputValue, setModelInputValue] = useState(savedModel ?? "");
  const [hasLocalEdits, setHasLocalEdits] = useState(false);

  const selectedProvider = provider ? PROVIDER_OPTIONS[provider] : null;

  const providerPresets = useMemo<MetabotModelPreset[]>(
    () => getProviderPresets(modelPresetsResponse?.providers, provider),
    [modelPresetsResponse?.providers, provider],
  );
  const modelOptions = useMemo<MetabotModelPresetOption[]>(
    () =>
      providerPresets.map((preset) => ({
        priority: preset.priority,
        display_name: preset.display_name,
        label: getModelPresetPriorityLabel(preset.priority),
        value: getModelPresetPriorityLabel(preset.priority),
      })),
    [providerPresets],
  );
  const selectedPreset = useMemo(
    () => findModelPresetByInputValue(providerPresets, modelInputValue),
    [modelInputValue, providerPresets],
  );
  const model = useMemo(
    () => getModelValueFromInput(provider, providerPresets, modelInputValue),
    [modelInputValue, provider, providerPresets],
  );
  const modelPresetsError = modelPresetsQuery.error
    ? getErrorMessage(modelPresetsQuery, t`Unable to load model presets.`)
    : null;
  const pendingProviderValue = getProviderSettingValue(provider, model);
  const isDirty = pendingProviderValue !== (savedProviderValue ?? null);

  useEffect(() => {
    if (!hasLocalEdits) {
      setProvider(savedProvider);
      setModelInputValue(savedModelInputValue);
    }
  }, [hasLocalEdits, savedModelInputValue, savedProvider]);

  useEffect(() => {
    setHasLocalEdits(false);
  }, [savedProviderValue]);

  const handleProviderChange = (value: string | null) => {
    setHasLocalEdits(true);

    if (!isMetabotProvider(value)) {
      setProvider(null);
      setModelInputValue("");
      return;
    }

    const parsedSavedProvider = parseProviderAndModel(savedProviderValue);
    const nextProviderPresets = getProviderPresets(
      modelPresetsResponse?.providers,
      value,
    );
    const inputPriority = parsePresetPriorityInputValue(modelInputValue);

    setProvider(value);
    setModelInputValue(
      parsedSavedProvider.provider === value
        ? getModelInputValue(nextProviderPresets, parsedSavedProvider.model)
        : inputPriority
          ? getModelPresetPriorityLabel(inputPriority)
          : "",
    );
  };

  const handleSave = async () => {
    if (!pendingProviderValue) {
      return;
    }

    await updateSetting({
      key: "ee-ai-metabot-provider",
      value: pendingProviderValue,
    });
  };

  return (
    <Stack gap="md">
      <Select
        label={t`Provider`}
        placeholder={t`Select a provider`}
        // TODO generic description
        description={
          selectedProvider
            ? getProviderDescription(selectedProvider.value)
            : null
        }
        data={Object.values(PROVIDER_OPTIONS).map(({ label, value }) => ({
          label,
          value,
        }))}
        value={provider}
        onChange={handleProviderChange}
      />

      {provider ? <MetabotProviderApiKey provider={provider} /> : null}

      <Select
        label={t`Model`}
        placeholder={t`Choose High, Medium, Low, or enter a model`}
        description={t`Choose High, Medium, or Low, or type a provider-specific model name.`}
        error={modelPresetsError}
        data={modelOptions}
        value={modelInputValue}
        onChange={(value) => {
          setHasLocalEdits(true);
          setModelInputValue(value);
        }}
        disabled={!provider}
        rightSection={
          selectedPreset ? (
            <Text size="xs" c="text-secondary" mr="0.75rem">
              {selectedPreset.display_name}
            </Text>
          ) : undefined
        }
        rightSectionPointerEvents="none"
        rightSectionWidth={selectedPreset ? "auto" : undefined}
        renderOption={({ option }) => {
          const preset = option as MetabotModelPresetOption;

          return (
            <SelectItem>
              <Text c="inherit" lh="inherit">
                {preset.label}
              </Text>
              <Text c="text-secondary" size="xs" ml="auto">
                {preset.display_name}
              </Text>
            </SelectItem>
          );
        }}
      />

      {!isDirty && provider && pendingProviderValue && isConfigured ? (
        <Group gap="sm">
          <Badge bg="success" variant="filled" size="sm">
            {t`Connected`}
          </Badge>
          <Text size="sm" c="text-secondary">
            {t`Using ${selectedProvider?.label} with ${getModelDisplayName(providerPresets, model) ?? pendingProviderValue}`}
          </Text>
        </Group>
      ) : (
        <Box>
          <Button
            onClick={handleSave}
            disabled={!pendingProviderValue || !isDirty}
            loading={updateSettingResult.isLoading}
          >
            {t`Save provider`}
          </Button>
        </Box>
      )}
    </Stack>
  );
}

function isMetabotProvider(
  value: string | null | undefined,
): value is MetabotProvider {
  return value === "anthropic" || value === "openai" || value === "openrouter";
}

function parseProviderAndModel(value: string | null | undefined) {
  if (!value) {
    return { provider: null, model: null };
  }

  const [provider, model] = value.split(/\/(.+)/, 2);

  if (!isMetabotProvider(provider) || !model) {
    return { provider: null, model: null };
  }

  return { provider, model };
}

function getProviderDescription(provider: MetabotProvider) {
  return match(provider)
    .with(
      "anthropic",
      () => t`Use Anthropic models directly with your Anthropic API key.`,
    )
    .with(
      "openai",
      () => t`Use OpenAI models directly with your OpenAI API key.`,
    )
    .with(
      "openrouter",
      () =>
        t`Use OpenRouter to access models from multiple providers with one API key.`,
    )
    .exhaustive();
}

function getModelPresetPriorityLabel(priority: MetabotModelPriority) {
  return match(priority)
    .with("high", () => t`High`)
    .with("medium", () => t`Medium`)
    .with("low", () => t`Low`)
    .exhaustive();
}

function getProviderSettingValue(
  provider: MetabotProvider | null,
  model: string | null,
) {
  return provider && model ? `${provider}/${model}` : null;
}

function normalizeModelInputValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function getProviderPresets(
  providers:
    | { provider: MetabotProvider; presets: MetabotModelPreset[] }[]
    | undefined,
  provider: MetabotProvider | null,
) {
  return provider
    ? (providers?.find(
        (providerPresets) => providerPresets.provider === provider,
      )?.presets ?? [])
    : [];
}

function parsePresetPriorityInputValue(
  value: string | null | undefined,
): MetabotModelPriority | null {
  const normalizedValue = normalizeModelInputValue(value)?.toLocaleLowerCase();

  if (!normalizedValue) {
    return null;
  }

  return (
    (["high", "medium", "low"] as const).find(
      (priority) =>
        getModelPresetPriorityLabel(priority).toLocaleLowerCase() ===
        normalizedValue,
    ) ?? null
  );
}

function findModelPresetByPriority(
  presets: MetabotModelPreset[],
  priority: MetabotModelPriority | null,
) {
  return priority
    ? (presets.find((preset) => preset.priority === priority) ?? null)
    : null;
}

function findModelPresetByInputValue(
  presets: MetabotModelPreset[],
  value: string | null | undefined,
) {
  return findModelPresetByPriority(
    presets,
    parsePresetPriorityInputValue(value),
  );
}

function findModelPresetByModel(
  presets: MetabotModelPreset[],
  model: string | null | undefined,
) {
  return model
    ? (presets.find((preset) => preset.model === model) ?? null)
    : null;
}

function getModelInputValue(
  presets: MetabotModelPreset[],
  model: string | null | undefined,
) {
  const preset = findModelPresetByModel(presets, model);

  return preset ? getModelPresetPriorityLabel(preset.priority) : (model ?? "");
}

function getModelValueFromInput(
  provider: MetabotProvider | null,
  presets: MetabotModelPreset[],
  inputValue: string,
) {
  const preset = findModelPresetByInputValue(presets, inputValue);

  if (preset) {
    return preset.model;
  }

  const normalizedValue = normalizeModelInputValue(inputValue);

  if (!normalizedValue) {
    return null;
  }

  const providerPrefix = provider ? `${provider}/` : null;

  return providerPrefix && normalizedValue.startsWith(providerPrefix)
    ? normalizeModelInputValue(normalizedValue.slice(providerPrefix.length))
    : normalizedValue;
}

function getModelDisplayName(
  presets: MetabotModelPreset[],
  model: string | null | undefined,
) {
  return findModelPresetByModel(presets, model)?.display_name ?? model;
}
