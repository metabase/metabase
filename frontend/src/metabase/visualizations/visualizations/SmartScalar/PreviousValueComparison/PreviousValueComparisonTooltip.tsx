import { lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { Flex, useMantineTheme } from "metabase/ui";
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
  const theme = useMantineTheme();
  const { changeType, comparisonValue, display } = comparison;

  const valueCandidates = [
    display.comparisonValue,
    ...(changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? [formatValue(comparisonValue, { ...formatOptions, compact: true })]
      : []),
    "",
  ];

  return (
    <Flex gap={TEXT_SPACING} align="center">
      <VariationPercent
        color={lighten(theme.fn.themeColor("text-medium"), 0.3)}
        comparison={comparison}
        iconSize={TOOLTIP_ICON_SIZE}
      >
        {display.percentChange}
      </VariationPercent>
      <VariationDetails
        color="var(--mb-color-tooltip-text-secondary)"
        separatorColor={lighten(theme.fn.themeColor("text-medium"), 0.15)}
      >
        <DetailCandidate
          color="var(--mb-color-tooltip-text-secondary)"
          comparison={comparison}
          valueFormatted={valueCandidates[0]}
        />
      </VariationDetails>
    </Flex>
  );
}
