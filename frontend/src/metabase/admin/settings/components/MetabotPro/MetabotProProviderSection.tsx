import { useState } from "react";
import { t } from "ttag";

import {
  Badge,
  Box,
  Button,
  Group,
  PasswordInput,
  Select,
  Stack,
  Text,
} from "metabase/ui";

import type { MetabotProProvider, ModelOption, ProviderOption } from "./types";

const PROVIDER_OPTIONS: ProviderOption[] = [
  {
    value: "anthropic",
    label: "Anthropic",
    description: t`Direct API access to Claude models`,
  },
  {
    value: "openrouter",
    label: "OpenRouter",
    description: t`Access Claude models through OpenRouter`,
  },
  {
    value: "bedrock",
    label: "Amazon Bedrock",
    description: t`Access Claude models through AWS Bedrock`,
  },
];

const MODEL_OPTIONS: ModelOption[] = [
  { value: "claude-opus-4.6", label: "Claude Opus 4.6" },
  { value: "claude-sonnet-4.6", label: "Claude Sonnet 4.6" },
  { value: "claude-haiku-4.5", label: "Claude Haiku 4.5" },
];

interface MetabotProProviderSectionProps {
  onConfigured?: (configured: boolean) => void;
}

export function MetabotProProviderSection({
  onConfigured,
}: MetabotProProviderSectionProps) {
  const [provider, setProvider] = useState<MetabotProProvider | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const isFormValid = provider && apiKey.trim().length > 0 && model;

  const handleProviderChange = (value: string | null) => {
    setProvider(value as MetabotProProvider | null);
    setIsSaved(false);
  };

  const handleApiKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setApiKey(value);
    setApiKeyError(null);
    setIsApiKeyVisible(true);
    setIsSaved(false);
  };

  const handleApiKeyBlur = () => {
    if (apiKey.trim().length === 0 && provider) {
      setApiKeyError(t`API key is required`);
    }
    setIsApiKeyVisible(false);
  };

  const handleModelChange = (value: string | null) => {
    setModel(value);
    setIsSaved(false);
  };

  const handleSave = () => {
    setIsSaved(true);
    onConfigured?.(true);
  };

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.value === provider);

  return (
    <Stack gap="md">
      <Box>
        <Select
          label={t`Provider`}
          placeholder={t`Select a provider`}
          data={PROVIDER_OPTIONS.map((p) => ({
            value: p.value,
            label: p.label,
          }))}
          value={provider}
          onChange={handleProviderChange}
        />
        {selectedProvider && (
          <Text size="sm" c="text-secondary" mt="xs">
            {selectedProvider.description}
          </Text>
        )}
      </Box>

      <Box>
        <PasswordInput
          label={t`API Key`}
          placeholder={
            provider === "bedrock"
              ? t`Enter your AWS credentials`
              : t`Enter your API key`
          }
          value={apiKey}
          onChange={handleApiKeyChange}
          onBlur={handleApiKeyBlur}
          error={apiKeyError}
          disabled={!provider}
          visible={isApiKeyVisible}
          onVisibilityChange={setIsApiKeyVisible}
        />
      </Box>

      <Box>
        <Select
          label={t`Model`}
          placeholder={t`Select a model`}
          data={MODEL_OPTIONS}
          value={model}
          onChange={handleModelChange}
          disabled={!provider || !apiKey.trim()}
        />
      </Box>

      {isSaved ? (
        <Group gap="sm">
          <Badge color="success" variant="filled" size="sm">
            {t`Connected`}
          </Badge>
          <Text size="sm" c="text-secondary">
            {t`Using ${selectedProvider?.label} with ${MODEL_OPTIONS.find((m) => m.value === model)?.label}`}
          </Text>
        </Group>
      ) : (
        <Box>
          <Button onClick={handleSave} disabled={!isFormValid}>
            {t`Save and Connect`}
          </Button>
        </Box>
      )}
    </Stack>
  );
}
