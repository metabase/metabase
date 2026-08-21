import type { ComponentType, SVGProps } from "react";

import { DefaultLogoIcon } from "metabase/common/components/LogoIcon";
import { Flex, Icon } from "metabase/ui";
import type { LlmProviderTypeName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";
import AnthropicMark from "./logos/anthropic.svg?component";
import AzureMark from "./logos/azure.svg?component";
import BedrockMark from "./logos/bedrock.svg?component";
import DeepSeekMark from "./logos/deepseek.svg?component";
import GoogleMark from "./logos/google.svg?component";
import MistralMark from "./logos/mistral.svg?component";
import MoonshotMark from "./logos/moonshot.svg?component";
import OpenAiMark from "./logos/openai.svg?component";
import OpenRouterMark from "./logos/openrouter.svg?component";
import ZaiMark from "./logos/zai.svg?component";

const GENERIC_PROVIDER_ICON = "ai";

// Every mark is inlined rather than loaded by URL: it lets the single-colour ones take the theme's text
// colour the way their brands publish them, and it keeps them out of the emitted-asset pipeline. Metabase
// is null because it is drawn from its own logo component, and vLLM because it falls back to the generic
// AI icon.
const PROVIDER_LOGOS: Record<
  LlmProviderTypeName,
  ComponentType<SVGProps<SVGSVGElement>> | null
> = {
  anthropic: AnthropicMark,
  openai: OpenAiMark,
  openrouter: OpenRouterMark,
  bedrock: BedrockMark,
  mistral: MistralMark,
  zai: ZaiMark,
  moonshot: MoonshotMark,
  deepseek: DeepSeekMark,
  google: GoogleMark,
  azure: AzureMark,
  vllm: null,
  metabase: null,
};

export function ProviderTypeIcon({
  type,
  size = 40,
}: {
  type: LlmProviderTypeName;
  size?: number;
}) {
  return (
    <Flex className={S.icon} w={size} h={size} align="center" justify="center">
      <ProviderTypeMark type={type} size={size / 2} />
    </Flex>
  );
}

function ProviderTypeMark({
  type,
  size,
}: {
  type: LlmProviderTypeName;
  size: number;
}) {
  if (type === "metabase") {
    return <DefaultLogoIcon height={size} />;
  }

  const Mark = PROVIDER_LOGOS[type];

  if (!Mark) {
    return <Icon name={GENERIC_PROVIDER_ICON} size={size} aria-hidden />;
  }

  return (
    <Mark className={S.mark} width={size} height={size} role="presentation" />
  );
}
