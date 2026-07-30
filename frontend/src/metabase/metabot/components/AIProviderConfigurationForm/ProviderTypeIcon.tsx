import { getLlmProviderLogo } from "metabase/metabot/utils/llm-provider";
import { Flex, Icon } from "metabase/ui";
import type { IconName, LlmProviderTypeName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";

export function ProviderTypeIcon({
  type,
  icon,
  size = 40,
}: {
  type: LlmProviderTypeName;
  icon: IconName;
  size?: number;
}) {
  const logo = getLlmProviderLogo(type);

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
