import { parse } from "csv-parse/browser/esm/sync";
import { stringify } from "csv-stringify/browser/esm/sync";

export const getValuesText = (values: string[] | string[][] = []) => {
  const res = stringify(values.map(toRow), {
    delimiter: ", ",
    quote: '"',
    escape: "\\",
  });
  return res;
};

export const getStaticValues = (
  value: string,
): [string, string | undefined][] => {
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

function toRow(value: string | string[]): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return [value];
}

type SelectItem = {
  value: string;
  label?: string;
};

function toValue(row: SelectItem): [string] | [string, string] {
  if (row.label) {
    return [row.value, row.label];
  }
  return [row.value];
}
