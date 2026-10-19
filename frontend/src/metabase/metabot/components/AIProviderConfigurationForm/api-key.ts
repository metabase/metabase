import type { LlmProviderType } from "metabase-types/api";

export type ApiKeyMatch = {
  providerType: LlmProviderType;
  fieldKey: string;
};

function getRecognizableFields(providerTypes: LlmProviderType[]) {
  return providerTypes
    .filter((providerType) => providerType.available && !providerType.managed)
    .flatMap((providerType) =>
      providerType.fields.flatMap((field) =>
        field.prefix
          ? [{ providerType, fieldKey: field.key, prefix: field.prefix }]
          : [],
      ),
    );
}

export function findProviderTypeForApiKey(
  providerTypes: LlmProviderType[],
  apiKey: string,
): ApiKeyMatch | undefined {
  const matches = getRecognizableFields(providerTypes).filter((field) =>
    apiKey.startsWith(field.prefix),
  );

  // OpenAI's `sk-` also matches an Anthropic `sk-ant-` key, so the longest prefix wins.
  const [best] = matches.sort((a, b) => b.prefix.length - a.prefix.length);
  return best;
}
