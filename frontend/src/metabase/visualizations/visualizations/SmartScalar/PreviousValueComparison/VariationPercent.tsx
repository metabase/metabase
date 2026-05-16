import type { ReactNode } from "react";

import { Ellipsified, Flex, Icon } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";

import type { ComparisonResult } from "../compute";

import S from "./PreviousValueComparison.module.css";

interface Props {
  children: ReactNode;
  color?: ColorName;
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
    <Flex align="center" maw="100%" style={{ color: changeColor ?? color }}>
      {changeArrowIconName && (
        <Icon
          name={changeArrowIconName}
          size={iconSize}
          mr="sm"
          className={S.variationIcon}
        />
      )}

      <Ellipsified fw={900} showTooltip={false}>
        {children}
      </Ellipsified>
    </Flex>
  );
};
