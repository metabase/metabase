import {
  SCALAR_TITLE_LINE_HEIGHT,
  TITLE_2_LINES_HEIGHT_THRESHOLD,
  TITLE_ICON_SIZE,
} from "./constants";

export const getTitleLinesCount = (height: number) =>
  height > TITLE_2_LINES_HEIGHT_THRESHOLD ? 2 : 1;

export const getTitleHeight = ({
  isDashboard,
  showSmallTitle,
  titleLinesCount,
}: {
  isDashboard: boolean;
  showSmallTitle: boolean;
  titleLinesCount: number;
}) => {
  if (!isDashboard) {
    return 0;
  }

  if (showSmallTitle) {
    return TITLE_ICON_SIZE;
  }

  return titleLinesCount * SCALAR_TITLE_LINE_HEIGHT;
};
