import type { Column, ColumnSizeConfig } from "./types";

const PREVIEW_COLUMN_PADDING = 2 * 32;

export const COLUMN_CONFIG: Record<Column, ColumnSizeConfig> = {
  nav: {
    flex: "6 1 0",
    min: 600,
    max: "100%",
  },
  table: {
    flex: "4 1 0",
    min: 400,
    max: "100%",
  },
  field: {
    flex: "4 1 0",
    min: 400,
    max: "100%",
  },
  preview: {
    flex: "4 1 0",
    min: 400,
    max: "100%",
  },
};

export const EMPTY_STATE_MIN_WIDTH = 400;
