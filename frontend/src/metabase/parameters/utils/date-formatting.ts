import type { OptionsType } from "metabase/lib/formatting/types";
import MetabaseSettings from "metabase/lib/settings";
import { getDateFilterDisplayName } from "metabase/querying/filters/utils/dates";
import { deserializeDateParameterValue } from "metabase/querying/parameters/utils/parsing";
import type { Parameter } from "metabase-types/api";

export function formatDateValue(
  parameter: Parameter,
  value: string,
  options?: OptionsType,
): string | null {
  const filter = deserializeDateParameterValue(value);
  if (filter == null) {
    return null;
  }

  // Get formatting settings from MetabaseSettings if not provided
  const formattingOptions = options || {};
  if (!options) {
    const customFormatting = MetabaseSettings.get("custom-formatting") || {};
    const temporalSettings = customFormatting["type/Temporal"] || {};
    Object.assign(formattingOptions, temporalSettings);
  }

  return getDateFilterDisplayName(
    filter,
    {
      withPrefix: parameter.type !== "date/single",
    },
    formattingOptions,
  );
}
