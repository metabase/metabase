import { parse } from "csv-parse/browser/esm/sync";

export function parseValues(
  str: string,
  parser: (str: string) => string | number | null = defaultParser,
): (string | number)[] {
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

function defaultParser(str: string): string | number | null {
  return str;
}

export function unique(values: (string | number)[]): string[] {
  return Array.from(new Set(values));
}
