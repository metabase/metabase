import { Text } from "metabase/ui";
import type { TemporalUnit } from "metabase-types/api";

import type { ComparisonType } from "../../types";
import { getOffsetLabel } from "../../utils";

type OffsetLabelProps = {
  comparisonType: ComparisonType;
  offsetUnit: TemporalUnit;
  offsetValue: number;
  canSelectOffset: boolean;
};

export function OffsetLabel({
  comparisonType,
  offsetUnit,
  offsetValue,
  canSelectOffset,
}: OffsetLabelProps) {
  const offsetLabel = getOffsetLabel(
    comparisonType,
    offsetUnit,
    offsetValue,
    canSelectOffset,
  );

  return <Text c="text-light">{offsetLabel}</Text>;
}
