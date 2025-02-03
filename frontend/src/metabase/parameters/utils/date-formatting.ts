import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/dates";
import type { Parameter } from "metabase-types/api";

export function formatDateValue(
  parameter: Parameter,
  value: string,
): string | null {
  const filter = deserializeDateParameterValue(value);
  if (filter == null) {
    return null;
  }

  return getDateFilterDisplayName(filter, {
    withPrefix: parameter.type !== "date/single",
  });
}
