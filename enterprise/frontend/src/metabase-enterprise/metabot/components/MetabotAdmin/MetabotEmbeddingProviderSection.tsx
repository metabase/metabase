import { useEffect, useState } from "react";
import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils/settings";
import {
  Box,
  Button,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "metabase/ui";

import { MetabotProviderApiKey } from "./MetabotProviderApiKey";

type EmbeddingProviderOption = {
  value: EmbeddingProvider;
  label: string;
  description: string;
};

type EmbeddingProvider = "ai-service" | "openai" | "ollama";

const EMBEDDING_PROVIDER_OPTIONS: EmbeddingProviderOption[] = [
  // {
  //   value: "ai-service",
  //   label: "AI service",
  //   description:
  //     "Use an OpenAI-compatible embedding service via base URL and API key.",
  // },
  {
    value: "openai",
    label: "OpenAI",
    description: "Use OpenAI embeddings with the instance OpenAI settings.",
  },
  // {
  //   value: "ollama",
  //   label: "Ollama",
  //   description: "Use a local Ollama embedding model.",
  // },
];

export function MetabotEmbeddingProviderSection() {
  const embeddingProviderSetting = useAdminSetting("ee-embedding-provider");
  const embeddingModelSetting = useAdminSetting("ee-embedding-model");
  const embeddingModelDimensionsSetting = useAdminSetting(
    "ee-embedding-model-dimensions",
  );

  const savedProvider = isEmbeddingProvider(embeddingProviderSetting.value)
    ? embeddingProviderSetting.value
    : "ai-service";
  const [provider, setProvider] = useState<EmbeddingProvider>(savedProvider);
  const [model, setModel] = useState(embeddingModelSetting.value ?? "");
  const [dimensions, setDimensions] = useState<number | string>(
    embeddingModelDimensionsSetting.value ?? 1024,
  );

  useEffect(() => {
    setProvider(savedProvider);
    setModel(embeddingModelSetting.value ?? "");
    setDimensions(embeddingModelDimensionsSetting.value ?? 1024);
  }, [
    embeddingModelDimensionsSetting.value,
    embeddingModelSetting.value,
    savedProvider,
  ]);

  const selectedProvider = EMBEDDING_PROVIDER_OPTIONS.find(
    (option) => option.value === provider,
  );
  const isDirty =
    provider !== savedProvider ||
    model !== (embeddingModelSetting.value ?? "") ||
    Number(dimensions || 0) !==
      Number(embeddingModelDimensionsSetting.value ?? 1024);

  const handleSave = async () => {
    await Promise.all([
      embeddingProviderSetting.updateSetting({
        key: "ee-embedding-provider" as never,
        value: provider,
      } as never),
      embeddingModelSetting.updateSetting({
        key: "ee-embedding-model" as never,
        value: model || null,
      } as never),
      embeddingModelDimensionsSetting.updateSetting({
        key: "ee-embedding-model-dimensions" as never,
        value: Number(dimensions),
      } as never),
    ]);
  };

  const isValid = Boolean(provider) && Boolean(model) && Number(dimensions) > 0;

  return (
    <Stack gap="md">
      <Select
        label={t`Embeddings provider`}
        placeholder={t`Select a provider`}
        // TODO Generic description
        description={selectedProvider ? selectedProvider.description : null}
        data={EMBEDDING_PROVIDER_OPTIONS}
        value={provider}
        onChange={(value) => {
          if (isEmbeddingProvider(value)) {
            setProvider(value);
          }
        }}
      />

      {provider === "openai" ? (
        <MetabotProviderApiKey provider={provider} />
      ) : null}

      <TextInput
        label={t`Embedding model`}
        placeholder={
          provider === "openai"
            ? "text-embedding-3-small"
            : provider === "ollama"
              ? "mxbai-embed-large"
              : "Snowflake/snowflake-arctic-embed-l-v2.0"
        }
        value={model}
        onChange={(event) => setModel(event.target.value)}
        required
      />

      <NumberInput
        label={t`Embedding model dimensions`}
        placeholder="1024"
        value={dimensions}
        onChange={(value) => setDimensions(value ?? "")}
        min={1}
        required
      />

      <Box>
        <Button
          onClick={handleSave}
          disabled={!isDirty || !isValid}
          loading={
            embeddingProviderSetting.updateSettingResult.isLoading ||
            embeddingModelSetting.updateSettingResult.isLoading ||
            embeddingModelDimensionsSetting.updateSettingResult.isLoading
          }
        >
          {t`Save embedding settings`}
        </Button>
      </Box>
    </Stack>
  );
}

function isEmbeddingProvider(
  value: string | null | undefined,
): value is EmbeddingProvider {
  return value === "ai-service" || value === "openai" || value === "ollama";
}
