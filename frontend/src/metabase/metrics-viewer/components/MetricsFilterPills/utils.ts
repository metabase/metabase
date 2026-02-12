import { getDatePickerValue } from "metabase/metrics/utils/dates";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import * as Lib from "metabase-lib";
import * as LibMetric from "metabase-lib/metric";

export function getFilterDisplayText(
  definition: LibMetric.MetricDefinition,
  filter: LibMetric.FilterClause,
): string {
  const stringParts = LibMetric.stringFilterParts(definition, filter);
  if (stringParts) {
    const dimName = LibMetric.displayInfo(
      definition,
      stringParts.dimension,
    ).displayName;
    const op = Lib.describeFilterOperator(stringParts.operator).toLowerCase();
    return `${dimName} ${op} ${stringParts.values.join(", ")}`;
  }

  const booleanParts = LibMetric.booleanFilterParts(definition, filter);
  if (booleanParts) {
    const dimName = LibMetric.displayInfo(
      definition,
      booleanParts.dimension,
    ).displayName;
    if (booleanParts.operator === "=") {
      return `${dimName} ${booleanParts.values[0] ? "true" : "false"}`;
    }
    return `${dimName} ${Lib.describeFilterOperator(booleanParts.operator).toLowerCase()}`;
  }

  const timeParts = LibMetric.timeFilterParts(definition, filter);
  if (timeParts) {
    const dimName = LibMetric.displayInfo(
      definition,
      timeParts.dimension,
    ).displayName;
    const op = Lib.describeFilterOperator(timeParts.operator).toLowerCase();
    const formattedValues = timeParts.values
      .map((d) => d.toLocaleTimeString())
      .join(", ");
    return `${dimName} ${op} ${formattedValues}`;
  }

  const dateValue = getDatePickerValue(definition, filter);
  if (dateValue) {
    const dateParts = LibMetric.filterParts(definition, filter);
    if (dateParts) {
      const dimName = LibMetric.displayInfo(
        definition,
        dateParts.dimension,
      ).displayName;
      return `${dimName} ${getDateFilterDisplayName(dateValue)}`;
    }
  }

  const numberParts = LibMetric.numberFilterParts(definition, filter);
  if (numberParts) {
    const dimName = LibMetric.displayInfo(
      definition,
      numberParts.dimension,
    ).displayName;
    const op = Lib.describeFilterOperator(numberParts.operator).toLowerCase();
    return `${dimName} ${op} ${numberParts.values.join(", ")}`;
  }

  const coordParts = LibMetric.coordinateFilterParts(definition, filter);
  if (coordParts) {
    const dimName = LibMetric.displayInfo(
      definition,
      coordParts.dimension,
    ).displayName;
    const op = Lib.describeFilterOperator(coordParts.operator).toLowerCase();
    return `${dimName} ${op} ${coordParts.values.join(", ")}`;
  }

  const parts = LibMetric.filterParts(definition, filter);
  if (parts) {
    return LibMetric.displayInfo(definition, parts.dimension).displayName;
  }

  return "";
}
