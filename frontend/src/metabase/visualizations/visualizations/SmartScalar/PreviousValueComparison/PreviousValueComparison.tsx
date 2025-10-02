import cx from "classnames";
import type { PropsWithChildren } from "react";
import innerText from "react-innertext";
import { jt } from "ttag";

import DashboardS from "metabase/css/dashboard.module.css";
import { getIsNightMode } from "metabase/dashboard/selectors";
import { lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { useSelector } from "metabase/lib/redux";
import { isEmpty } from "metabase/lib/validate";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Flex, Text, Title, Tooltip, useMantineTheme } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import {
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  SPACING,
  TOOLTIP_ICON_SIZE,
} from "../constants";
import { formatChangeAutoPrecision, getChangeWidth } from "../utils";

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

export function PreviousValueComparison({
  comparison,
  width,
  fontFamily,
  formatOptions,
}: PreviousValueComparisonProps) {
  const fontSize = "0.875rem";

  const {
    changeType,
    percentChange,
    comparisonDescStr,
    comparisonValue,
    changeArrowIconName,
    changeColor,
    display,
  } = comparison;

  const theme = useMantineTheme();
  const isNightMode = useSelector(getIsNightMode);

  const fittedChangeDisplay =
    changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChangeAutoPrecision(percentChange as number, {
          fontFamily,
          fontWeight: 900,
          width: getChangeWidth(width),
        })
      : display.percentChange;

  const availableComparisonWidth =
    width -
    4 * SPACING -
    ICON_SIZE -
    ICON_MARGIN_RIGHT -
    measureTextWidth(innerText(<Separator />), {
      size: fontSize,
      family: fontFamily,
      weight: 700,
    }) -
    measureTextWidth(fittedChangeDisplay, {
      size: fontSize,
      family: fontFamily,
      weight: 900,
    });

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

  const detailCandidates = valueCandidates.map((valueStr) =>
    getDetailCandidate(valueStr),
  );
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    (e) =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

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
    <Tooltip
      // this tooltip's label does not support text wrapping (it could though)
      // so we're just letting it take as much space as it needs to prevent overflow
      maw="100%"
      disabled={fullDetailDisplay === fittedDetailDisplay}
      position="bottom"
      label={
        <Flex align="center">
          <VariationPercent iconSize={TOOLTIP_ICON_SIZE} inTooltip>
            {display.percentChange}
          </VariationPercent>
          <VariationDetails inTooltip>
            {tooltipFullDetailDisplay}
          </VariationDetails>
        </Flex>
      }
    >
      <Flex
        wrap="wrap"
        align="center"
        justify="center"
        mx="sm"
        lh="1.2rem"
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
      >
        <VariationPercent iconSize={ICON_SIZE}>
          {fittedChangeDisplay}
        </VariationPercent>
        <VariationDetails>{fittedDetailDisplay}</VariationDetails>
      </Flex>
    </Tooltip>
  );
}
