import { jt } from "ttag";

import type { ColorName } from "metabase/lib/colors/types";
import { isEmpty } from "metabase/lib/validate";
import { Text } from "metabase/ui";

import type { ComparisonResult } from "../compute";

interface Props {
  color: ColorName;
  comparison: ComparisonResult;
  valueFormatted: string | number | JSX.Element | null;
}

export function DetailCandidate({ color, comparison, valueFormatted }: Props) {
  const { comparisonDescStr } = comparison;

  if (isEmpty(valueFormatted)) {
    return comparisonDescStr;
  }

  if (isEmpty(comparisonDescStr)) {
    return (
      <Text c={color} component="span" lh={1}>
        {valueFormatted}
      </Text>
    );
  }

  return jt`${comparisonDescStr}: ${(
    <Text key="value-str" c={color} component="span" lh={1}>
      {valueFormatted}
    </Text>
  )}`;
}
