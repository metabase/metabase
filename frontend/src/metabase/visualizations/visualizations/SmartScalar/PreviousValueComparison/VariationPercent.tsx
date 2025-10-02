import type { PropsWithChildren } from "react";

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
  comparison: ComparisonResult;
  iconSize: string | number;
  inTooltip?: boolean;
}

export const VariationPercent = ({
  comparison,
  inTooltip,
  iconSize,
  children,
}: PropsWithChildren<Props>) => {
  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);
  const noChangeColor =
    inTooltip || isNightMode
      ? lighten(theme.fn.themeColor("text-medium"), 0.3)
      : "text-light";
  const { changeArrowIconName, changeColor } = comparison;

  return (
    <Flex align="center" maw="100%" c={changeColor ?? noChangeColor}>
      {changeArrowIconName && (
        <VariationIcon name={changeArrowIconName} size={iconSize} />
      )}

      <VariationValue showTooltip={false}>{children}</VariationValue>
    </Flex>
  );
};
