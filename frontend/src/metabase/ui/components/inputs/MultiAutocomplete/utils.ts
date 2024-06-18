import { parse } from "csv-parse/browser/esm/sync";

export function parseValues(str: string): string[] {
  try {
    const strings = parse(str, {
      delimiter: [",", "\t", "\n"],
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: '"',
      escape: "\\",
    }).flat();

    return strings;
  } catch (err) {
    return [];
  }
}

export function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
