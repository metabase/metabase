import type { IconName } from "metabase/ui";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./SourceColorIndicator.module.css";

type SourceColorIndicatorProps = {
  colors?: string[];
  fallbackIcon: IconName;
  iconSize?: number;
};

export function SourceColorIndicator({
  colors,
  fallbackIcon,
  iconSize = 14,
}: SourceColorIndicatorProps) {
  if (colors && colors.length > 1) {
    return (
      <Flex align="center">
        {colors.map((c, i) => (
          <Box key={i} className={S.colorDot} bg={c} />
        ))}
      </Flex>
    );
  }

  return <Icon name={fallbackIcon} size={iconSize} c={colors?.[0]} />;
}
