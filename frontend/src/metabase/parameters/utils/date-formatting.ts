import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { deserializeDateFilter } from "metabase/querying/parameters/utils/dates";
import type { Parameter } from "metabase-types/api";

export function formatDateValue(
  parameter: Parameter,
  value: string,
): string | null {
  const filter = deserializeDateFilter(value);
  if (filter == null) {
    return null;
  }

  return getDateFilterDisplayName(filter, {
    withPrefix: parameter.type !== "date/single",
  });
}
