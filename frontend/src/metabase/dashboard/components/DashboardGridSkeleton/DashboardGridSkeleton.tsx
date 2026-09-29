import cx from "classnames";

import { isHeadingDashCard, isTextDashCard } from "metabase/dashboard/utils";
import type { StoreDashcard } from "metabase/redux/store";
import { Box, Skeleton } from "metabase/ui";
import ChartSkeleton from "metabase/visualizations/components/skeletons/ChartSkeleton";
import type { CardDisplayType } from "metabase-types/api";
import { isCardDisplayType } from "metabase-types/api";

import S from "./DashboardGridSkeleton.module.css";

type SkeletonCardContent =
  | { kind: "chart"; display: CardDisplayType | undefined }
  | { kind: "text"; lines: string[]; isHeading: boolean };

type SkeletonCardPlacement = {
  key: string;
  content: SkeletonCardContent;
  col: number;
  row: number;
  size_x: number;
  size_y: number;
  /** Overrides the row-based height with a fixed pixel height when set. */
  heightPx?: number;
};

const TABLE_SKELETON_HEIGHT_PX = 360;
const MAX_TEXT_SKELETON_LINES = 12;
const MIN_TEXT_LINE_CHARS = 3;
const MAX_TEXT_LINE_CHARS = 40;

/**
 * A generic layout used only on a first-ever cold load, when no cached
 * layout is available for the dashboard yet.
 */
const GENERIC_SKELETON_CARDS: readonly SkeletonCardPlacement[] = [
  {
    key: "0",
    content: { kind: "chart", display: "line" },
    col: 0,
    row: 0,
    size_x: 12,
    size_y: 6,
  },
  {
    key: "1",
    content: { kind: "chart", display: "bar" },
    col: 12,
    row: 0,
    size_x: 12,
    size_y: 6,
  },
  {
    key: "2",
    content: { kind: "chart", display: "scalar" },
    col: 0,
    row: 6,
    size_x: 8,
    size_y: 6,
  },
  {
    key: "3",
    content: { kind: "chart", display: "pie" },
    col: 8,
    row: 6,
    size_x: 8,
    size_y: 6,
  },
  {
    key: "4",
    content: { kind: "chart", display: "area" },
    col: 16,
    row: 6,
    size_x: 8,
    size_y: 6,
  },
  {
    key: "5",
    content: { kind: "chart", display: "table" },
    col: 0,
    row: 12,
    size_x: 24,
    size_y: 9,
    heightPx: TABLE_SKELETON_HEIGHT_PX,
  },
];

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

const getPlacements = (
  cards: readonly StoreDashcard[] | undefined,
): readonly SkeletonCardPlacement[] => {
  if (!cards || cards.length === 0) {
    return GENERIC_SKELETON_CARDS;
  }

  return cards.map((dc) => ({
    key: String(dc.id),
    content: getCardContent(dc),
    col: dc.col,
    row: dc.row,
    size_x: dc.size_x,
    size_y: dc.size_y,
  }));
};

const getRowCount = (placements: readonly SkeletonCardPlacement[]): number =>
  placements.reduce(
    (rows, { row, size_y, heightPx }) =>
      Math.max(rows, heightPx != null ? row : row + size_y),
    0,
  );

const getExtraHeightPx = (
  placements: readonly SkeletonCardPlacement[],
): number =>
  placements.reduce(
    (extra, { heightPx }) =>
      heightPx != null ? Math.max(extra, heightPx) : extra,
    0,
  );

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
 * Renders a dashboard's card layout as a skeleton, shown instantly when a
 * dashboard is opened so that a loading spinner is never displayed. When the
 * dashboard's real layout is known (cached from a prior visit) it is drawn to
 * the same grid geometry the real cards will use, so the transition is
 * seamless; otherwise a generic placeholder layout is used. Heading and text
 * cards render title-style line skeletons rather than a chart. The cards then
 * keep their own per-card content skeletons once the real grid mounts.
 */
export const DashboardGridSkeleton = ({
  cards,
  className,
}: {
  cards?: readonly StoreDashcard[];
  className?: string;
}) => {
  const placements = getPlacements(cards);

  return (
    <Box
      className={cx(S.root, className)}
      data-testid="dashboard-grid-skeleton"
    >
      <Box
        className={S.grid}
        style={{
          "--skeleton-rows": getRowCount(placements),
          "--skeleton-extra": `${getExtraHeightPx(placements)}px`,
        }}
      >
        {placements.map(
          ({ key, content, col, row, size_x, size_y, heightPx }) => (
            <Box
              key={key}
              className={cx(S.card, {
                [S.transparent]: content.kind === "text",
              })}
              style={{
                "--skeleton-col": col,
                "--skeleton-row": row,
                "--skeleton-w": size_x,
                "--skeleton-h": size_y,
                ...(heightPx != null
                  ? { "--skeleton-card-height": `${heightPx}px` }
                  : {}),
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
          ),
        )}
      </Box>
    </Box>
  );
};
