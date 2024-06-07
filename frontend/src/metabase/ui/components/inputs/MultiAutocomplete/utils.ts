import { parse } from "csv-parse/browser/esm/sync";

import type { Base } from "./types";

export function parseValues<TValue extends Base>(
  str: string,
  parser: (str: string) => TValue | null = defaultParser,
): TValue[] {
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

    return strings.map(parser);
  } catch (err) {
    return [];
  }
}

function defaultParser<TValue extends Base>(str: string): TValue | null {
  // @ts-expect-error: for the default case we ignore the type
  return str;
}

export function unique<TValue extends Base>(values: TValue[]): TValue[] {
  return Array.from(new Set(values));
}
