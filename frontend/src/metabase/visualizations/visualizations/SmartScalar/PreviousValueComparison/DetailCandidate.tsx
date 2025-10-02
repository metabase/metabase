import { jt } from "ttag";

import { isEmpty } from "metabase/lib/validate";
import { Text } from "metabase/ui";

import type { ComparisonResult } from "../compute";

interface Props {
  comparison: ComparisonResult;
  inTooltip?: boolean;
  valueFormatted: string | number | JSX.Element | null;
}

export function DetailCandidate({
  comparison,
  inTooltip,
  valueFormatted,
}: Props) {
  const { comparisonDescStr } = comparison;

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
}
