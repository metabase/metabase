import type { TransitionProps } from "metabase/ui";

import type { ColumnSizeConfig, DrawerPanel } from "./types";

export const NAV_COLUMN_CONFIG: ColumnSizeConfig = {
  flex: "1 1 0",
  min: 800,
  max: "100%",
};

export const DRAWER_PANEL_WIDTH: Record<DrawerPanel, number> = {
  database: 560,
  schema: 560,
  table: 560,
  field: 480,
  preview: 480,
};

export const REVEAL_WIDTH_DURATION_MS = 200;

export const REVEAL_WIDTH_TRANSITION = {
  in: { gridTemplateColumns: "1fr" },
  out: { gridTemplateColumns: "0fr" },
  transitionProperty: "grid-template-columns",
} satisfies TransitionProps["transition"];

export const EMPTY_STATE_MIN_WIDTH = 400;
