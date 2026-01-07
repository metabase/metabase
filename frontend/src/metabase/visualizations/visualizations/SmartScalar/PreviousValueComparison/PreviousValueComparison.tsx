import innerText from "react-innertext";

import DashboardS from "metabase/css/dashboard.module.css";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import { Badge, Flex, Group, Icon, Stack, Tooltip } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import {
  ELLIPSIS_BADGE_WIDTH,
  ICON_MARGIN_RIGHT,
  ICON_SIZE,
  SPACING,
  TEXT_SPACING,
} from "../constants";
import { formatChangeAutoPrecision, getChangeWidth } from "../utils";

import { DetailCandidate } from "./DetailCandidate";
import { PreviousValueComparisonTooltip } from "./PreviousValueComparisonTooltip";
import { VariationDetails } from "./VariationDetails";
import { VariationPercent } from "./VariationPercent";

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  fontFamily: string;
  formatOptions: ColumnSettings;
  tooltipComparisons: ComparisonResult[];
  width: number;
}

export function PreviousValueComparison({
  comparison,
  fontFamily,
  formatOptions,
  tooltipComparisons,
  width,
}: PreviousValueComparisonProps) {
  const fontSize = "0.875rem";
  const { changeType, percentChange, comparisonValue, display } = comparison;
  const showsOtherValuesInTooltip = tooltipComparisons.length > 1;

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
    TEXT_SPACING -
    ICON_SIZE -
    (showsOtherValuesInTooltip ? ELLIPSIS_BADGE_WIDTH + TEXT_SPACING : 0) -
    ICON_MARGIN_RIGHT -
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

  const detailCandidates = valueCandidates.map((valueFormatted) => {
    // intentionally calling the component as a function
    // since otherwise measurements don't work as expected
    return DetailCandidate({
      color: "text-secondary",
      comparison,
      valueFormatted,
    });
  });
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    (e) =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

  return (
    <Tooltip
      disabled={
        fullDetailDisplay === fittedDetailDisplay &&
        tooltipComparisons.length === 0
      }
      label={
        <Stack gap="xs" fz={14}>
          {tooltipComparisons.map((comparison, index) => {
            return (
              <PreviousValueComparisonTooltip
                comparison={comparison}
                key={index}
                formatOptions={formatOptions}
              />
            );
          })}
        </Stack>
      }
      position="bottom"
    >
      <Flex
        gap={TEXT_SPACING}
        wrap="wrap"
        align="center"
        justify="center"
        mx="sm"
        lh="1.2rem"
        className={DashboardS.fullscreenNormalText}
      >
        <VariationPercent
          color="text-tertiary"
          comparison={comparison}
          iconSize={ICON_SIZE}
        >
          {fittedChangeDisplay}
        </VariationPercent>

        <VariationDetails color="text-secondary">
          {fittedDetailDisplay}
        </VariationDetails>

        {showsOtherValuesInTooltip && (
          <Badge px="xs" size="xs" variant="light" w={ELLIPSIS_BADGE_WIDTH}>
            <Group align="center" h="100%">
              <Icon name="ellipsis" size={12} />
            </Group>
          </Badge>
        )}
      </Flex>
    </Tooltip>
  );
}
