import { t } from "ttag";

import { Text } from "metabase/ui";

import type { ComparisonType } from "../../types";

type OffsetLabelProps = {
  comparisonType: ComparisonType;
};

export function OffsetLabel({ comparisonType }: OffsetLabelProps) {
  return (
    <Text c="text-light">
      {comparisonType === "offset" && t`ago`}
      {comparisonType === "moving-average" && t`moving average`}
    </Text>
  );
}
