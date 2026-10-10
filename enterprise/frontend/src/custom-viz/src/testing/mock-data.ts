import type { Column, Row, Series } from "../types/data";

import { type ColumnKind, getColumnPreset } from "./mock-host";

export const mockColumn = (
  kind: ColumnKind,
  name: string,
  overrides: Partial<Column> = {},
): Column => ({
  ...getColumnPreset(kind),
  name,
  display_name: name,
  ...overrides,
});

export const mockSeries = (cols: Column[], rows: Row[]): Series => [
  { data: { cols, rows } },
];
