import type { ParameterValue } from "metabase-types/api";

// Lazy load CSV libraries to reduce initial bundle size
const loadParse = () =>
  import("csv-parse/browser/esm/sync").then((module) => module.parse);
const loadStringify = () =>
  import("csv-stringify/browser/esm/sync").then((module) => module.stringify);

export const getValuesText = async (
  values: (string | ParameterValue)[] = [],
): Promise<string> => {
  const stringify = await loadStringify();
  return stringify(
    values.map(toRow).filter(([value]) => value !== null),
    {
      delimiter: ", ",
      quote: '"',
      quoted_match: /(,|\t|\n)/,
      escape: "\\",
    },
  ).trim();
};

export const getStaticValues = async (
  value: string,
): Promise<ParameterValue[]> => {
  try {
    const parse = await loadParse();
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
