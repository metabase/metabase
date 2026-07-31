import { LogoIcon } from "metabase/common/components/LogoIcon";
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
    return <LogoIcon height={size} />;
  }

  const logo = getLlmProviderLogo(type);

  return logo ? (
    <img src={logo} alt="" width={size} height={size} />
  ) : (
    <Icon name={icon} size={size} aria-hidden />
  );
}
