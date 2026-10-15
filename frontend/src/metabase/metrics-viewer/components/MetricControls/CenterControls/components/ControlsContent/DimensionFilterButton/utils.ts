import { match } from "ts-pattern";
import { t } from "ttag";

import { toDateFilterDisplayValue } from "metabase/common/metrics/utils/dates";
import type { DimensionFilterValue } from "metabase/metrics-viewer/utils";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as Lib from "metabase-lib";

export function getFilterDisplayName(
  dimensionFilter: DimensionFilterValue,
): string {
  return match(dimensionFilter)
    .with({ type: "boolean" }, (filter) => {
      if (filter.operator === "=" && filter.values.length > 0) {
        return filter.values[0] ? t`True` : t`False`;
      }
      return Lib.describeFilterOperator(filter.operator).toLowerCase();
    })
    .with({ type: "time" }, (filter) => {
      const operator = Lib.describeFilterOperator(
        filter.operator,
      ).toLowerCase();
      const formattedValues = filter.values
        .map((date) => date.toLocaleTimeString())
        .join(", ");
      return `${operator} ${formattedValues}`;
    })
    .with(
      { type: "string" },
      { type: "number" },
      { type: "coordinate" },
      (filter) => {
        const operator = Lib.describeFilterOperator(
          filter.operator,
        ).toLowerCase();
        if (filter.values.length === 0) {
          return operator;
        }
        return `${operator} ${filter.values.join(", ")}`;
      },
    )
    .with(
      { type: "specific-date" },
      { type: "relative-date" },
      { type: "exclude-date" },
      (filter) => getDateFilterDisplayName(toDateFilterDisplayValue(filter)),
    )
    .with({ type: "default" }, (filter) =>
      Lib.describeFilterOperator(filter.operator).toLowerCase(),
    )
    .exhaustive();
}
