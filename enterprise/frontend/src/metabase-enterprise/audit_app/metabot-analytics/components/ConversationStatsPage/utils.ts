import { t } from "ttag";

import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

export function getDateLabel(value: string | null): string {
  const parsed = value ? deserializeDateParameterValue(value) : undefined;
  return parsed
    ? getDateFilterDisplayName(parsed, { withPrefix: false })
    : t`Date`;
}

export function getFilterDays(dateValue: string): number {
  const parsed = deserializeDateParameterValue(dateValue);
  if (parsed?.type === "relative" && parsed.value < 0) {
    return Math.abs(parsed.value);
  }
  return 30;
}
