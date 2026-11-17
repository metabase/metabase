import { t } from "ttag";

import {
  PERIOD_GRANULARITIES,
  type PeriodGranularity,
  type RowIdentity,
} from "./inference";

export function getRowIdentityLabel(rowIdentity: RowIdentity): string {
  switch (rowIdentity) {
    case "natural":
      return t`Natural key`;
    case "surrogate":
      return t`Surrogate key`;
    case "hash":
      return t`Hash key`;
    case "composite":
      return t`Composite key`;
    case "none":
      return t`No key`;
  }
}

export function getPeriodGranularityLabel(
  granularity: PeriodGranularity,
): string {
  switch (granularity) {
    case "minute":
      return t`Minute`;
    case "hour":
      return t`Hour`;
    case "day":
      return t`Day`;
    case "week":
      return t`Week`;
    case "month":
      return t`Month`;
    case "quarter":
      return t`Quarter`;
    case "year":
      return t`Year`;
  }
}

export function getPeriodGranularityOptions(): {
  value: PeriodGranularity;
  label: string;
}[] {
  return PERIOD_GRANULARITIES.map((value) => ({
    value,
    label: getPeriodGranularityLabel(value),
  }));
}
