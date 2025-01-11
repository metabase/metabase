import { formatDateFilter } from "metabase/querying/filters/utils/dates";
import { deserializeDateFilter } from "metabase/querying/parameters/utils/dates";

export function formatDateValue(value: string): string | null {
  const filterValue = deserializeDateFilter(value);
  if (filterValue == null) {
    return null;
  }

  return formatDateFilter(filterValue);
}
