import { parse } from "csv-parse/browser/esm/sync";

export function parseValues(str: string): string[] {
  try {
    return parse(str, {
      delimiter: [",", "\t", "\n"],
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
      quote: '"',
      escape: "\\",
    }).flat();
  } catch (err) {
    return [];
  }
}

export function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const uniques = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    uniques.push(value);
  }

  return uniques;
}
