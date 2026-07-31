import { DefaultLogoIcon } from "metabase/common/components/LogoIcon";
import { Flex, Icon } from "metabase/ui";
import type { IconName, LlmProviderTypeName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";
import AnthropicLogo from "./logos/anthropic.svg";
import AzureLogo from "./logos/azure.svg";
import BedrockLogo from "./logos/bedrock.svg";
import MistralLogo from "./logos/mistral.svg";
import OpenAiLogo from "./logos/openai.svg";
import OpenRouterLogo from "./logos/openrouter.svg";
import ZaiLogo from "./logos/zai.svg";

// null where the mark is not an image: Metabase is drawn from its own logo component
const PROVIDER_LOGOS: Record<LlmProviderTypeName, string | null> = {
  anthropic: AnthropicLogo,
  openai: OpenAiLogo,
  openrouter: OpenRouterLogo,
  mistral: MistralLogo,
  zai: ZaiLogo,
  azure: AzureLogo,
  bedrock: BedrockLogo,
  metabase: null,
};

export function ProviderTypeIcon({
  type,
  icon,
  size = 40,
}: {
  type: LlmProviderTypeName;
  icon: IconName;
  size?: number;
}) {
  return (
    <Flex className={S.icon} w={size} h={size} align="center" justify="center">
      <ProviderTypeMark type={type} icon={icon} size={size / 2} />
    </Flex>
  );
}

function ProviderTypeMark({
  type,
  icon,
  size,
}: {
  type: LlmProviderTypeName;
  icon: IconName;
  size: number;
}) {
  if (type === "metabase") {
    // this provider is Metabase's own hosted service, so it keeps the Metabase mark on a
    // whitelabelled instance rather than taking on the customer's logo
    return <DefaultLogoIcon height={size} />;
  }

  const logo = PROVIDER_LOGOS[type];

  return logo ? (
    <img src={logo} alt="" width={size} height={size} />
  ) : (
    <Icon name={icon} size={size} aria-hidden />
  );
}
