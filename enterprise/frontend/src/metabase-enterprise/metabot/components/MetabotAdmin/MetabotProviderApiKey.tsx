import { c, jt, t } from "ttag";

import { AdminSettingInput } from "metabase/admin/settings/components/widgets/AdminSettingInput";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import type { MetabotProvider } from "metabase-types/api";

import { PROVIDER_OPTIONS } from "./utils";

const API_KEY_SETTING_BY_PROVIDER: Record<
  MetabotProvider,
  "ee-anthropic-api-key" | "ee-openai-api-key" | "ee-openrouter-api-key"
> = {
  anthropic: "ee-anthropic-api-key",
  openai: "ee-openai-api-key",
  openrouter: "ee-openrouter-api-key",
};

export function MetabotProviderApiKey({
  provider,
}: {
  provider: MetabotProvider;
}) {
  const selectedProvider = PROVIDER_OPTIONS[provider];
  const selectedApiKeySetting = API_KEY_SETTING_BY_PROVIDER[provider];

  return (
    <AdminSettingInput
      key={selectedApiKeySetting}
      name={selectedApiKeySetting}
      title={t`API key`}
      description={jt`Need a key? ${(
        <ExternalLink
          key={selectedProvider.value}
          href={selectedProvider.addKeyUrl}
        >
          {c("{0} is the name of an AI provider")
            .t`Create one in ${selectedProvider.label}`}
        </ExternalLink>
      )}`}
      inputType="password"
      placeholder={
        selectedProvider
          ? selectedProvider.apiKeyPlaceholder
          : t`Enter your API key`
      }
    />
  );
}
