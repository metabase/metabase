import type { Column, ColumnSizeConfig } from "./types";

export const COLUMN_CONFIG: Record<Column, ColumnSizeConfig> = {
  nav: { initial: 320, min: 240, max: 440 },
  table: { initial: 320, min: 240, max: 640 },
  field: { initial: 480, min: 280, max: 640 }, // this is field + preview container
  preview: { initial: 400, min: 400, max: 640 },
};
