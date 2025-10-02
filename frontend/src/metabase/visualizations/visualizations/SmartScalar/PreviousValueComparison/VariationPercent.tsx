import type { ReactNode } from "react";

import { getIsNightMode } from "metabase/dashboard/selectors";
import { lighten } from "metabase/lib/colors";
import { useSelector } from "metabase/lib/redux";
import { Flex, useMantineTheme } from "metabase/ui";

import type { ComparisonResult } from "../compute";

import {
  VariationIcon,
  VariationValue,
} from "./PreviousValueComparison.styled";

interface Props {
  children: ReactNode;
  color: string;
  comparison: ComparisonResult;
  iconSize: string | number;
}

export const VariationPercent = ({
  children,
  color,
  comparison,
  iconSize,
}: Props) => {
  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);
  const { changeArrowIconName, changeColor } = comparison;
  const noChangeColor = isNightMode
    ? lighten(theme.fn.themeColor("text-medium"), 0.3)
    : color;

  return (
    <Flex align="center" maw="100%" c={changeColor ?? noChangeColor}>
      {changeArrowIconName && (
        <VariationIcon name={changeArrowIconName} size={iconSize} />
      )}

      <VariationValue showTooltip={false}>{children}</VariationValue>
    </Flex>
  );
};
