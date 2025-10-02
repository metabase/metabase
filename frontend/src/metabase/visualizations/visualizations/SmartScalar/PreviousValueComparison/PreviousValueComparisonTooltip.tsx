import type { PropsWithChildren } from "react";
import { jt } from "ttag";

import { getIsNightMode } from "metabase/dashboard/selectors";
import { lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import { Flex, Text, Title, useMantineTheme } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import { TOOLTIP_ICON_SIZE } from "../constants";

import {
  VariationIcon,
  VariationValue,
} from "./PreviousValueComparison.styled";
import { Separator } from "./Separator";

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  width: number;
  fontFamily: string;
  formatOptions: ColumnSettings;
}

export function PreviousValueComparisonTooltip({
  comparison,
  formatOptions,
}: PreviousValueComparisonProps) {
  const {
    changeType,
    comparisonDescStr,
    comparisonValue,
    changeArrowIconName,
    changeColor,
    display,
  } = comparison;

  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  const valueCandidates = [
    display.comparisonValue,
    ...(changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? [formatValue(comparisonValue, { ...formatOptions, compact: true })]
      : []),
    "",
  ];

  const getDetailCandidate = (
    valueFormatted: string | number | JSX.Element | null,
    { inTooltip }: { inTooltip?: boolean } = {},
  ) => {
    if (isEmpty(valueFormatted)) {
      return comparisonDescStr;
    }

    const descColor = inTooltip
      ? "var(--mb-color-tooltip-text-secondary)"
      : "var(--mb-color-text-secondary)";

    if (isEmpty(comparisonDescStr)) {
      return (
        <Text
          key={valueFormatted as string}
          c={descColor}
          component="span"
          lh={1}
        >
          {valueFormatted}
        </Text>
      );
    }

    return jt`${comparisonDescStr}: ${(
      <Text key="value-str" c={descColor} component="span" lh={1}>
        {valueFormatted}
      </Text>
    )}`;
  };

  const tooltipFullDetailDisplay = getDetailCandidate(valueCandidates[0], {
    inTooltip: true,
  });

  const VariationPercent = ({
    inTooltip,
    iconSize,
    children,
  }: PropsWithChildren<{ inTooltip?: boolean; iconSize: string | number }>) => {
    const noChangeColor =
      inTooltip || isNightMode
        ? lighten(theme.fn.themeColor("text-medium"), 0.3)
        : "text-light";

    return (
      <Flex align="center" maw="100%" c={changeColor ?? noChangeColor}>
        {changeArrowIconName && (
          <VariationIcon name={changeArrowIconName} size={iconSize} />
        )}
        <VariationValue showTooltip={false}>{children}</VariationValue>
      </Flex>
    );
  };

  const VariationDetails = ({
    inTooltip,
    children,
  }: PropsWithChildren<{ inTooltip?: boolean }>) => {
    if (!children) {
      return null;
    }

    const detailColor = inTooltip
      ? "var(--mb-color-tooltip-text-secondary)"
      : "var(--mb-color-text-secondary)";

    return (
      <Title order={5} style={{ whiteSpace: "pre", color: detailColor }}>
        <Separator inTooltip={inTooltip} />
        {children}
      </Title>
    );
  };

  return (
    <Flex align="center">
      <VariationPercent iconSize={TOOLTIP_ICON_SIZE} inTooltip>
        {display.percentChange}
      </VariationPercent>
      <VariationDetails inTooltip>{tooltipFullDetailDisplay}</VariationDetails>
    </Flex>
  );
}
