import { t } from "ttag";

import { getDatePickerValue } from "metabase/common/metrics/utils/dates";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

export type FilterDisplayParts = {
  label: string;
  value: string | null;
};

function getDimensionName(
  definition: LibMetric.MetricDefinition,
  dimension: LibMetric.DimensionMetadata,
) {
  return LibMetric.displayInfo(definition, dimension).displayName;
}

export function getFilterDisplayParts(
  definition: LibMetric.MetricDefinition,
  filter: LibMetric.FilterClause,
): FilterDisplayParts {
  const stringParts = LibMetric.stringFilterParts(definition, filter);
  if (stringParts) {
    const dimName = getDimensionName(definition, stringParts.dimension);
    const op = Lib.describeFilterOperator(stringParts.operator).toLowerCase();
    return { label: `${dimName} ${op}:`, value: stringParts.values.join(", ") };
  }

  const booleanParts = LibMetric.booleanFilterParts(definition, filter);
  if (booleanParts) {
    const dimName = getDimensionName(definition, booleanParts.dimension);
    if (booleanParts.operator === "=") {
      return {
        label: `${dimName}:`,
        value: booleanParts.values[0] ? "true" : "false",
      };
    }
    return {
      label: `${dimName} ${Lib.describeFilterOperator(booleanParts.operator).toLowerCase()}`,
      value: null,
    };
  }

  const timeParts = LibMetric.timeFilterParts(definition, filter);
  if (timeParts) {
    const dimName = getDimensionName(definition, timeParts.dimension);
    const op = Lib.describeFilterOperator(timeParts.operator).toLowerCase();
    const formattedValues = timeParts.values
      .map((d) => d.toLocaleTimeString())
      .join(", ");
    return { label: `${dimName} ${op}:`, value: formattedValues };
  }

  const dateValue = getDatePickerValue(definition, filter);
  if (dateValue) {
    const dateParts = LibMetric.filterParts(definition, filter);
    if (dateParts) {
      const dimName = getDimensionName(definition, dateParts.dimension);
      return {
        label: `${dimName}:`,
        value: getDateFilterDisplayName(dateValue),
      };
    }
  }

  const numberParts = LibMetric.numberFilterParts(definition, filter);
  if (numberParts) {
    const dimName = getDimensionName(definition, numberParts.dimension);
    const op = Lib.describeFilterOperator(numberParts.operator).toLowerCase();
    return { label: `${dimName} ${op}:`, value: numberParts.values.join(", ") };
  }

  const coordParts = LibMetric.coordinateFilterParts(definition, filter);
  if (coordParts) {
    const dimName = getDimensionName(definition, coordParts.dimension);
    const op = Lib.describeFilterOperator(coordParts.operator).toLowerCase();
    return { label: `${dimName} ${op}:`, value: coordParts.values.join(", ") };
  }

  const parts = LibMetric.filterParts(definition, filter);
  if (parts) {
    return {
      label: getDimensionName(definition, parts.dimension),
      value: null,
    };
  }

  return { label: t`Unknown filter`, value: null };
}
