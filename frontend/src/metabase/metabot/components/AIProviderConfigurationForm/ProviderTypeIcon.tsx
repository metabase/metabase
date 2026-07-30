import { Flex, Icon } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./ProviderTypeIcon.module.css";

export function ProviderTypeIcon({
  icon,
  size = 40,
}: {
  icon: IconName;
  size?: number;
}) {
  return (
    <Flex className={S.icon} w={size} h={size} align="center" justify="center">
      <Icon name={icon} size={size / 2} aria-hidden />
    </Flex>
  );
}
