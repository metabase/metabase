import type { ReactNode } from "react";

import { Flex } from "metabase/ui";

import type { ComparisonResult } from "../compute";

import {
  VariationIcon,
  VariationValue,
} from "./PreviousValueComparison.styled";

interface Props {
  children: ReactNode;
  color?: string;
  comparison: ComparisonResult;
  iconSize: string | number;
}

export const VariationPercent = ({
  children,
  color,
  comparison,
  iconSize,
}: Props) => {
  const { changeArrowIconName, changeColor } = comparison;

  return (
    <Flex align="center" maw="100%" c={changeColor ?? color}>
      {changeArrowIconName && (
        <VariationIcon name={changeArrowIconName} size={iconSize} />
      )}

      <VariationValue showTooltip={false}>{children}</VariationValue>
    </Flex>
  );
};
