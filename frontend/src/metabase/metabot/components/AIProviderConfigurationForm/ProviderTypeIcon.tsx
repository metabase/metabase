import type { ComponentType, SVGProps } from "react";

import { DefaultLogoIcon } from "metabase/common/components/LogoIcon";
import { Flex, Icon } from "metabase/ui";
import type { LlmProviderTypeName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";
import AnthropicMark from "./logos/anthropic.svg?component";
import AzureLogo from "./logos/azure.svg";
import BedrockMark from "./logos/bedrock.svg?component";
import MistralLogo from "./logos/mistral.svg";
import OpenAiMark from "./logos/openai.svg?component";
import OpenRouterMark from "./logos/openrouter.svg?component";
import ZaiLogo from "./logos/zai.svg";

const GENERIC_PROVIDER_ICON = "ai";

// A component is a single-colour mark, inlined so it takes the theme's text colour the way its brand
// publishes it — dark on light, light on dark. A string is a full-colour mark used as it ships. Metabase
// is null because it is drawn from its own logo component.
const PROVIDER_LOGOS: Record<
  LlmProviderTypeName,
  ComponentType<SVGProps<SVGSVGElement>> | string | null
> = {
  anthropic: AnthropicMark,
  openai: OpenAiMark,
  openrouter: OpenRouterMark,
  bedrock: BedrockMark,
  mistral: MistralLogo,
  zai: ZaiLogo,
  azure: AzureLogo,
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

  const logo = PROVIDER_LOGOS[type];

  if (!logo) {
    return <Icon name={GENERIC_PROVIDER_ICON} size={size} aria-hidden />;
  }

  if (typeof logo === "string") {
    return <img src={logo} alt="" width={size} height={size} />;
  }

  const Mark = logo;
  return (
    <Mark className={S.mark} width={size} height={size} role="presentation" />
  );
}
