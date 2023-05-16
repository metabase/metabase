import NativeQuery from "metabase-lib/queries/NativeQuery";
import { SCROLL_MARGIN, MIN_HEIGHT_LINES } from "./constants";

const LINE_HEIGHT = 16;

export function getEditorLineHeight(lines: number) {
  return lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;
}

function getLinesForHeight(height: number) {
  return (height - 2 * SCROLL_MARGIN) / LINE_HEIGHT;
}

const FRACTION_OF_TOTAL_VIEW_HEIGHT = 0.4;

// the query editor needs a fixed pixel height for now
// until we extract the resizable component
const FULL_HEIGHT = 400;

// This determines the max height that the editor *automatically* takes.
// - On load, long queries will be capped at this length
// - When loading an empty query, this is the height
// - When the editor grows during typing this is the max height
export function getMaxAutoSizeLines(viewHeight: number) {
  const pixelHeight = viewHeight * FRACTION_OF_TOTAL_VIEW_HEIGHT;
  return Math.ceil(getLinesForHeight(pixelHeight));
}

type GetVisibleLinesCountParams = {
  query?: NativeQuery;
  viewHeight: number | "full";
};

function getVisibleLinesCount({
  query,
  viewHeight,
}: {
  query?: NativeQuery;
  viewHeight: number;
}) {
  const maxAutoSizeLines = getMaxAutoSizeLines(viewHeight);
  const queryLineCount = query?.lineCount() || maxAutoSizeLines;
  return Math.max(Math.min(queryLineCount, maxAutoSizeLines), MIN_HEIGHT_LINES);
}

export function calcInitialEditorHeight({
  query,
  viewHeight,
}: GetVisibleLinesCountParams) {
  if (viewHeight === "full") {
    // override for action editor
    return FULL_HEIGHT;
  }
  const lines = getVisibleLinesCount({ query, viewHeight });
  return getEditorLineHeight(lines);
}
