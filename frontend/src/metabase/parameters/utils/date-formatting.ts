import type {
  DateFormattingSettings,
  Parameter,
  ParameterValueOrArray,
} from "metabase-types/api";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";

export function formatDateValue(
  parameter: Parameter,
  value: ParameterValueOrArray | null | undefined,
  formattingSettings?: DateFormattingSettings,
): string | null {
  const filter = deserializeDateParameterValue(value);
  if (filter == null) {
    return null;
  }

  return getDateFilterDisplayName(filter, {
    withPrefix: parameter.type !== "date/single",
    formattingSettings,
  });
}
