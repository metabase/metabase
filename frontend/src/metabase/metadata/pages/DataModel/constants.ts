import type { Column, ColumnSizeConfig } from "./types";

export const COLUMN_CONFIG: Record<Column, ColumnSizeConfig> = {
  nav: { initial: 376, min: 280, max: 440 },
  table: { initial: 376, min: 280, max: 640 },
  field: { initial: 480, min: 280, max: 640 }, // this is field + preview container
  preview: { initial: 440, min: 440, max: 640 },
};
