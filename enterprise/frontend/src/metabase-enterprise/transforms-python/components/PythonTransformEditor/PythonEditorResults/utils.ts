import type { RowValue } from "metabase-types/api";

export type Row = Record<string, RowValue>;

// Parses the output of a Python transform (given as JSON-lines)
// into a set of headers and rows.
//
// TODO: The server should return a non-stringified JSON array of rows,
// not a string.
export function parseOutput(output: string): {
  headers: string[];
  rows: Row[];
} {
  if (!output?.trim()) {
    return { headers: [], rows: [] };
  }

  const lines = output.trim().split("\n");
  const headers = new Set<string>();
  const rows: Row[] = [];

  for (const line of lines) {
    try {
      const data = JSON.parse(line) as Row;
      for (const key in data) {
        headers.add(key);
      }
      rows.push(data);
    } catch (err) {
      // noop
    }
  }

  return {
    headers: Array.from(headers),
    rows,
  };
}
