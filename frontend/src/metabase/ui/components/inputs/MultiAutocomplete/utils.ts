import { parse } from "csv-parse/browser/esm/sync";

export function parseValues<ValueType extends string | number>(
  str: string,
  parser: (str: string) => ValueType | null = defaultParser,
): ValueType[] {
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

function defaultParser<ValueType extends string | number>(
  str: string,
): ValueType | null {
  // @ts-expect-error: for the default case we ignore the type
  return str;
}

export function unique<ValueType extends string | number>(
  values: ValueType[],
): ValueType[] {
  return Array.from(new Set(values));
}
