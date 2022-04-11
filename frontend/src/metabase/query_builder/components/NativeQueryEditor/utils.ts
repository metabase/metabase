import NativeQuery from "metabase-lib/lib/queries/NativeQuery";
import { SCROLL_MARGIN, MIN_HEIGHT_LINES } from "./constants";

const LINE_HEIGHT = 16;

export function getEditorLineHeight(lines: number) {
  return lines * LINE_HEIGHT + 2 * SCROLL_MARGIN;
}

function getLinesForHeight(height: number) {
  return (height - 2 * SCROLL_MARGIN) / LINE_HEIGHT;
}

const FRACTION_OF_TOTAL_VIEW_HEIGHT = 0.4;

// This determines the max height that the editor *automatically* takes.
// - On load, long queries will be capped at this length
// - When loading an empty query, this is the height
// - When the editor grows during typing this is the max height
export function getMaxAutoSizeLines(viewHeight: number) {
  const pixelHeight = viewHeight * FRACTION_OF_TOTAL_VIEW_HEIGHT;
  return Math.ceil(getLinesForHeight(pixelHeight));
}

type GetVisibleLinesCountParams = { query?: NativeQuery; viewHeight: number };

function getVisibleLinesCount({
  query,
  viewHeight,
}: GetVisibleLinesCountParams) {
  const maxAutoSizeLines = getMaxAutoSizeLines(viewHeight);
  const queryLineCount = query?.lineCount() || maxAutoSizeLines;
  return Math.max(Math.min(queryLineCount, maxAutoSizeLines), MIN_HEIGHT_LINES);
}

export function calcInitialEditorHeight(params: GetVisibleLinesCountParams) {
  const lines = getVisibleLinesCount(params);
  return getEditorLineHeight(lines);
}
