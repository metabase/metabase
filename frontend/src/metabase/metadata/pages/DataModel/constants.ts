import type { Column, ColumnSizeConfig } from "./types";

export const COLUMN_CONFIG: Record<Column, ColumnSizeConfig> = {
  nav: { flex: "6 1 0", initial: 376, min: 280, max: 440 },
  table: { flex: "8 1 0", initial: 640, min: 280, max: 640 },
  field: { flex: "9 1 0", initial: 480, min: 280, max: 640 },
  preview: { flex: "9 1 0", initial: 640, min: 440 + 2 * 32, max: 640 },
};

export const MIN_PREVIEW_CONTAINER_WIDTH = 440 + 2 * 32;

export const EMPTY_STATE_MIN_WIDTH = 240;

export const RESIZE_HANDLE_WIDTH = 10;
