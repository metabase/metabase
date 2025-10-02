import type { PropsWithChildren } from "react";

import { formatValue } from "metabase/lib/formatting/value";
import { Flex, Title } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import { TOOLTIP_ICON_SIZE } from "../constants";

import { DetailCandidate } from "./DetailCandidate";
import { Separator } from "./Separator";
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
      <VariationPercent
        comparison={comparison}
        iconSize={TOOLTIP_ICON_SIZE}
        inTooltip
      >
        {display.percentChange}
      </VariationPercent>
      <VariationDetails inTooltip>
        <DetailCandidate
          comparison={comparison}
          inTooltip
          valueFormatted={valueCandidates[0]}
        />
      </VariationDetails>
    </Flex>
  );
}
