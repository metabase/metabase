/* eslint-disable-next-line import/no-unresolved */
import { parse } from "csv-parse/sync";

export function parseValues(str: string): string[] {
  try {
    return parse(str, {
      delimiter: [",", "\t", "\n"],
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      quote: '"',
      escape: "\\",
    }).flat();
  } catch (err) {
    return [];
  }
}
