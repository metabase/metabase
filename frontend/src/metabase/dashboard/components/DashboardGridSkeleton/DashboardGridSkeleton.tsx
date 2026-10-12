import cx from "classnames";
import { t } from "ttag";

import visuallyHidden from "metabase/css/core/visually-hidden.module.css";
import {
  getIsLastSeenDashboardFixedWidth,
  getLastSeenTabDashcards,
} from "metabase/dashboard/selectors";
import { isHeadingDashCard, isTextDashCard } from "metabase/dashboard/utils";
import { useSelector } from "metabase/redux";
import type { StoreDashcard } from "metabase/redux/store";
import { Box, Skeleton } from "metabase/ui";
import {
  GRID_ASPECT_RATIO,
  GRID_MARGINS,
  GRID_WIDTH,
  MIN_ROW_HEIGHT,
} from "metabase/utils/dashboard_grid";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { CardDisplayType, DashboardId } from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import { FixedWidthContainer } from "../Dashboard/DashboardComponents";

import S from "./DashboardGridSkeleton.module.css";

type SkeletonCardContent =
  | { kind: "chart"; display: CardDisplayType | undefined }
  | { kind: "text"; lines: string[]; isHeading: boolean };

export type SkeletonCardPlacement = {
  key: string;
  content: SkeletonCardContent;
  col: number;
  row: number;
  size_x: number;
  size_y: number;
};

const MAX_TEXT_SKELETON_LINES = 12;
const MIN_TEXT_LINE_CHARS = 3;
const MAX_TEXT_LINE_CHARS = 40;

/** The grid geometry react-grid-layout uses, handed to the CSS. */
const GRID_GEOMETRY_STYLE = {
  "--grid-columns": GRID_WIDTH,
  "--grid-aspect-ratio": GRID_ASPECT_RATIO,
  "--grid-min-row-height": `${MIN_ROW_HEIGHT}px`,
  "--grid-margin-x": `${GRID_MARGINS.desktop[0]}px`,
  "--grid-margin-y": `${GRID_MARGINS.desktop[1]}px`,
  "--grid-mobile-margin-y": `${GRID_MARGINS.mobile[1]}px`,
};

const getTextLines = (text: string): string[] =>
  text.split("\n").slice(0, MAX_TEXT_SKELETON_LINES);

const getCardContent = (dc: StoreDashcard): SkeletonCardContent => {
  if (isHeadingDashCard(dc) || isTextDashCard(dc)) {
    return {
      kind: "text",
      lines: getTextLines(dc.visualization_settings.text ?? ""),
      isHeading: isHeadingDashCard(dc),
    };
  }

  return {
    kind: "chart",
    display: isCardDisplayType(dc.card.display) ? dc.card.display : undefined,
  };
};

export const getPlacements = (
  cards: readonly StoreDashcard[],
): SkeletonCardPlacement[] =>
  cards.map((dc) => ({
    key: String(dc.id),
    content: getCardContent(dc),
    col: dc.col,
    row: dc.row,
    size_x: dc.size_x,
    size_y: dc.size_y,
  }));

const getRowCount = (placements: readonly SkeletonCardPlacement[]): number =>
  placements.reduce((rows, { row, size_y }) => Math.max(rows, row + size_y), 0);

const getLineWidth = (chars: number): string => {
  const clamped = Math.min(
    Math.max(chars, MIN_TEXT_LINE_CHARS),
    MAX_TEXT_LINE_CHARS,
  );
  return `min(${clamped}ch, 100%)`;
};

const TextCardSkeleton = ({
  lines,
  isHeading,
}: {
  lines: string[];
  isHeading: boolean;
}) => (
  <div
    className={cx(S.textContent, { [S.textContentHeading]: isHeading })}
    data-testid="dashboard-skeleton-text"
  >
    {lines.map((line, index) => {
      const trimmed = line.trim();
      return trimmed.length === 0 ? (
        <Box key={index} h="1.2em" />
      ) : (
        <Skeleton
          key={index}
          height="1.2em"
          width={getLineWidth(trimmed.length)}
          radius="sm"
        />
      );
    })}
  </div>
);

/**
 * Draws card placements at the grid geometry the real cards will use, so the
 * transition to the loaded dashboard is seamless. Heading and text cards render
 * title-style line skeletons rather than a chart.
 */
export const CardLayoutSkeleton = ({
  placements,
}: {
  placements: readonly SkeletonCardPlacement[];
}) => (
  <Box className={S.root}>
    <Box
      className={S.grid}
      style={{
        ...GRID_GEOMETRY_STYLE,
        "--skeleton-rows": getRowCount(placements),
      }}
      data-testid="dashboard-grid-skeleton-cards"
    >
      {placements.map(({ key, content, col, row, size_x, size_y }) => (
        <Box
          key={key}
          className={cx(S.card, { [S.transparent]: content.kind === "text" })}
          style={{
            "--skeleton-col": col,
            "--skeleton-row": row,
            "--skeleton-w": size_x,
            "--skeleton-h": size_y,
          }}
        >
          {content.kind === "text" ? (
            <TextCardSkeleton
              lines={content.lines}
              isHeading={content.isHeading}
            />
          ) : (
            <ChartSkeleton display={content.display} />
          )}
        </Box>
      ))}
    </Box>
  </Box>
);

/**
 * The dashboard's card grid as a skeleton, shown while the dashboard loads so
 * that no spinner is needed. Cards are only drawn once the dashboard's real
 * layout is known, from the in-memory Redux cache: the cards of the tab the
 * user is landing on, at the dashboard's own width. Until then the grid stays
 * empty rather than showing cards the dashboard may not have. Once the real
 * grid mounts, its cards keep their own per-card content skeletons.
 */
export const DashboardGridSkeleton = ({
  dashboardId,
}: {
  dashboardId: DashboardId | null;
}) => {
  const lastSeenTabDashcards = useSelector((state) =>
    getLastSeenTabDashcards(state, dashboardId),
  );
  const isFixedWidth = useSelector((state) =>
    getIsLastSeenDashboardFixedWidth(state, dashboardId),
  );
  const placements = getPlacements(lastSeenTabDashcards);

  return (
    <FixedWidthContainer
      isFixedWidth={isFixedWidth}
      aria-busy
      data-testid="dashboard-grid-skeleton"
    >
      <span role="status" className={visuallyHidden.visuallyHidden}>
        {t`Loading…`}
      </span>
      {placements.length > 0 && <CardLayoutSkeleton placements={placements} />}
    </FixedWidthContainer>
  );
};
