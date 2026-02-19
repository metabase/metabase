import type { IconName } from "metabase/ui";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./SourceColorIndicator.module.css";

type SourceColorIndicatorProps = {
  colors?: string[];
  fallbackIcon: IconName;
  size?: number;
  limit?: number;
};

export function SourceColorIndicator({
  colors,
  fallbackIcon,
  size = 14,
  limit = 6,
}: SourceColorIndicatorProps) {
  if (colors && colors.length > 1) {
    const capped = colors.slice(0, limit);
    const overlap = Math.round(size / 3);
    return (
      <Flex align="center">
        {capped.map((color, index) => (
          <Box
            key={index}
            className={S.colorDot}
            w={size}
            h={size}
            ml={index === 0 ? 0 : -overlap}
            style={{ backgroundColor: color }}
          />
        ))}
      </Flex>
    );
  }

  return (
    <Icon name={fallbackIcon} size={size} style={{ color: colors?.[0] }} />
  );
}
