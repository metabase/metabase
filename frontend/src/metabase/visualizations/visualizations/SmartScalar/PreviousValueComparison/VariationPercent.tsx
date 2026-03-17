import type { ReactNode } from "react";

import type { ColorName } from "metabase/lib/colors/types";
import { Flex } from "metabase/ui";

import type { ComparisonResult } from "../compute";

import {
  VariationIcon,
  VariationValue,
} from "./PreviousValueComparison.styled";

interface Props {
  children: ReactNode;
  color?: ColorName;
  comparison: ComparisonResult;
  iconSize: string | number;
  iconGap?: number;
}

export const VariationPercent = ({
  children,
  color,
  comparison,
  iconSize,
  iconGap,
}: Props) => {
  const { changeArrowIconName, changeColor } = comparison;

  return (
    <Flex align="center" maw="100%" style={{ color: changeColor ?? color }}>
      {changeArrowIconName && (
        <VariationIcon
          name={changeArrowIconName}
          size={iconSize}
          gap={iconGap}
        />
      )}

      <VariationValue showTooltip={false}>{children}</VariationValue>
    </Flex>
  );
};
