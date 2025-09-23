import type { RowValue } from "metabase-types/api";

export type Row = Record<string, RowValue>;

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
    const data = JSON.parse(line) as Row;
    for (const key in data) {
      headers.add(key);
    }
    rows.push(data);
  }

  return {
    headers: Array.from(headers),
    rows,
  };
}
