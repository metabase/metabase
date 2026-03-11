import { match } from "ts-pattern";
import { t } from "ttag";

import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as Lib from "metabase-lib";

import type { DimensionFilterValue } from "../../../utils/dimension-filters";

function toDatePickerValue(
  filter: Extract<
    DimensionFilterValue,
    { type: "specific-date" | "relative-date" | "exclude-date" }
  >,
): DatePickerValue {
  switch (filter.type) {
    case "specific-date":
      return {
        type: "specific",
        operator: filter.operator,
        values: filter.values,
        hasTime: filter.hasTime,
      };
    case "relative-date":
      return {
        type: "relative",
        unit: filter.unit,
        value: filter.value,
        offsetUnit: filter.offsetUnit ?? undefined,
        offsetValue: filter.offsetValue ?? undefined,
        options: filter.options,
      };
    case "exclude-date":
      return {
        type: "exclude",
        operator: filter.operator,
        unit: filter.unit ?? undefined,
        values: filter.values,
      };
  }
}

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
      (filter) => getDateFilterDisplayName(toDatePickerValue(filter)),
    )
    .with({ type: "default" }, (filter) =>
      Lib.describeFilterOperator(filter.operator).toLowerCase(),
    )
    .exhaustive();
}
