import type { IconName } from "metabase-types/api";

/**
 * Lucide icons picked by hand on the "Lucide comparison" Storybook page.
 * Values are Lucide component names. To update, click "Copy picks file" on
 * that page and paste the result over this file.
 */
export const LUCIDE_ICON_PICKS: Partial<Record<IconName, string>> = {
  add_data: "DatabasePlus",
  ai: "Sparkle",
  bar: "ChartColumnBig",
  birthday: "CakeSlice",
  boxplot: "ChartCandlestick",
  chart_layout_default: "SquarePaddingBottom",
  code_block: "SquareCode",
  click: "MousePointer",
  contract: "Minimize2",
  document: "File",
  download: "Download",
  edit_document: "FilePen",
  edit_document_outlined: "FilePen",
  event: "CalendarFold",
  expand: "Maximize2",
  expand_arrow: "ChevronsUpDown",
  extract: "SquareArrowRightExit",
  gear_settings_filled: "Settings",
  grid_bordered: "Grid3x3",
  horizontal_bar: "ChartBarBig",
  join_full_outer: "Table",
  index: "ListIndentIncrease",
  notebook: "LayoutPanelTop",
  pivot_table: "Table2",
  embed_interactive: "Gamepad",
  sliders: "Settings2",
  table_index: "BetweenHorizontalStart",
  upload: "Upload",
};
