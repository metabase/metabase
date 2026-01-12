import { formatValue } from "metabase/lib/formatting/value";
import { Flex } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import { TEXT_SPACING, TOOLTIP_ICON_SIZE } from "../constants";

import { DetailCandidate } from "./DetailCandidate";
import { VariationDetails } from "./VariationDetails";
import { VariationPercent } from "./VariationPercent";

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  formatOptions: ColumnSettings;
}

export function PreviousValueComparisonTooltip({
  comparison,
  formatOptions,
}: PreviousValueComparisonProps) {
  const { changeType, comparisonValue, display } = comparison;

  const valueCandidates = [
    display.comparisonValue,
    ...(changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? [formatValue(comparisonValue, { ...formatOptions, compact: true })]
      : []),
    "",
  ];

  return (
    <Flex gap={TEXT_SPACING} align="flex-start">
      <VariationPercent comparison={comparison} iconSize={TOOLTIP_ICON_SIZE}>
        {display.percentChange}
      </VariationPercent>
      <VariationDetails>
        <DetailCandidate
          color="white"
          comparison={comparison}
          valueFormatted={valueCandidates[0]}
        />
      </VariationDetails>
    </Flex>
  );
}
