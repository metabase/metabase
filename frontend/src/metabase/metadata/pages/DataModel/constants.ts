import type { Column, ColumnSizeConfig } from "./types";

const PREVIEW_COLUMN_PADDING = 2 * 32;

export const COLUMN_CONFIG: Record<Column, ColumnSizeConfig> = {
  nav: {
    flex: "6 1 0",
    min: 280,
    max: 440,
  },
  table: {
    flex: "8 1 0",
    min: 320,
    max: 640,
  },
  field: {
    flex: "9 1 0",
    min: 320,
    max: 680,
  },
  preview: {
    flex: "10 1 0",
    min: 440 + PREVIEW_COLUMN_PADDING, // 440 to fully fit the Number > Between filter preview
    max: 670 + PREVIEW_COLUMN_PADDING, // 670 to fully fit the Date > Fixed date range filter preview
  },
};

export const EMPTY_STATE_MIN_WIDTH = 240;
