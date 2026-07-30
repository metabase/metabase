import { Flex, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";

const PROVIDER_LOGOS: Record<string, string> = {
  anthropic: "anthropic.svg",
  openai: "openai.svg",
  openrouter: "openrouter.svg",
  azure: "azure.svg",
  bedrock: "bedrock.svg",
};

function getProviderLogo(type: string) {
  const logo = PROVIDER_LOGOS[type];
  return logo ? `app/assets/img/llm-providers/${logo}` : undefined;
}

export function ProviderTypeIcon({
  type,
  icon,
  size = 40,
}: {
  type: string;
  icon: IconName;
  size?: number;
}) {
  const logo = getProviderLogo(type);

  return (
    <Flex className={S.icon} w={size} h={size} align="center" justify="center">
      {logo ? (
        <img src={logo} alt="" width={size / 2} height={size / 2} />
      ) : (
        <Icon name={icon} size={size / 2} aria-hidden />
      )}
    </Flex>
  );
}
