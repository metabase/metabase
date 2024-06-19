import { parse } from "csv-parse/browser/esm/sync";
import { stringify } from "csv-stringify/browser/esm/sync";

import type { ParameterValue } from "metabase-types/api";

export const getValuesText = (
  values: (string | ParameterValue)[] = [],
): string => {
  return stringify(values.map(toRow), {
    delimiter: ", ",
    quote: '"',
    escape: "\\",
  }).trim();
};

export const getStaticValues = (value: string): ParameterValue[] => {
  try {
    const strings = parse(value, {
      delimiter: [","],
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: '"',
      escape: "\\",
      columns: ["value", "label"],
      ignore_last_delimiters: true,
    }).map(toValue);

    return strings;
  } catch (err) {
    return [];
  }
};

function toRow(value: string | ParameterValue): ParameterValue {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

type SelectItem = {
  value: string;
  label?: string;
};

function toValue(row: SelectItem): ParameterValue {
  if (row.label) {
    return [row.value, row.label];
  }
  return [row.value];
}
