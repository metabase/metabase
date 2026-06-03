import cx from "classnames";
import type { CSSProperties } from "react";

import { Box, type BoxProps } from "metabase/ui";

import S from "./MetabotLoader.module.css";

type DotCell = 0 | 1;

export type MetabotLoaderMask = readonly (readonly DotCell[])[];

/**
 * The Metabase mark on a 5x4 dot grid (`1` = a lit dot of the "M"). The grid
 * uses the same dot pitch as the response dot-field (see MetabotThinking), so
 * the logo reads as a cluster of lit dots within that field rather than a
 * separate, coarser grid floating on top.
 */
// prettier-ignore
export const METABOT_LOGO_MASK = [
  [1, 0, 0, 0, 1],
  [1, 1, 0, 1, 1],
  [1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1],
] as const;

export const METABOT_TOOL_MASKS = {
  chart: [
    [0, 0, 0, 0, 1],
    [0, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  code: [
    [0, 1, 0, 1, 0],
    [1, 0, 0, 0, 1],
    [1, 0, 1, 0, 1],
    [1, 0, 0, 0, 1],
    [0, 1, 0, 1, 0],
  ],
  docs: [
    [1, 1, 1, 1, 0],
    [1, 0, 0, 1, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
  ],
  list: [
    [1, 0, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [1, 0, 1, 1, 1],
  ],
  search: [
    [0, 1, 1, 1, 0, 0, 0],
    [1, 0, 0, 0, 1, 0, 0],
    [1, 0, 0, 0, 1, 0, 0],
    [1, 0, 0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0, 1, 0],
    [0, 0, 0, 0, 0, 0, 1],
  ],
  table: [
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
    [1, 0, 1, 0, 1],
    [1, 1, 1, 1, 1],
  ],
  tool: [
    [0, 1, 0, 1, 0],
    [1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0],
    [1, 0, 1, 0, 1],
    [0, 1, 0, 1, 0],
  ],
} as const satisfies Record<string, MetabotLoaderMask>;

export const METABOT_EMPTY_MASK = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
] as const satisfies MetabotLoaderMask;

const getMaskRows = (mask: MetabotLoaderMask) => mask.length;
const getMaskCols = (mask: MetabotLoaderMask) =>
  Math.max(...mask.map((row) => row.length));

// One fixed lattice large enough for every mask. Because the grid never
// resizes, switching masks only lights/dims dots in place — nothing reflows,
// so the morph reads as one pattern dissolving into the next.
const ALL_MASKS: MetabotLoaderMask[] = [
  METABOT_LOGO_MASK,
  ...Object.values(METABOT_TOOL_MASKS),
];
const GRID_ROWS = Math.max(...ALL_MASKS.map(getMaskRows));
const GRID_COLS = Math.max(...ALL_MASKS.map(getMaskCols));

const getMaskOffset = (outerSize: number, innerSize: number) =>
  Math.floor((outerSize - innerSize) / 2);
const hasDot = (
  mask: MetabotLoaderMask,
  row: number,
  col: number,
  rowOffset: number,
  colOffset: number,
) => mask[row - rowOffset]?.[col - colOffset] === 1;

export interface MetabotLoaderProps extends BoxProps {
  /** Which dot pattern to show. Changing it dissolves smoothly to the new one. */
  mask?: MetabotLoaderMask;
  "data-testid"?: string;
}

/**
 * Animated "thinking" indicator for Metabot, drawn as the Metabase logo made of
 * dots. Every glyph shares one fixed lattice; changing `mask` simply re-lights
 * dots and a CSS opacity transition dissolves one pattern into the next. The
 * morph is therefore interruption-proof: a new mask arriving mid-dissolve just
 * re-aims the same per-dot transition from wherever each dot currently is,
 * rather than remounting and snapping back to a start state. A separate scale
 * pulse keeps the mark alive — opacity is owned by the morph and transform by
 * the pulse, so the two never fight over the same property.
 */
export const MetabotLoader = ({
  mask = METABOT_LOGO_MASK,
  "data-testid": dataTestId = "metabot-response-loader",
  className,
  style,
  ...boxProps
}: MetabotLoaderProps) => {
  const rowOffset = getMaskOffset(GRID_ROWS, getMaskRows(mask));
  const colOffset = getMaskOffset(GRID_COLS, getMaskCols(mask));
  const logoStyle = {
    "--cols": GRID_COLS,
    "--rows": GRID_ROWS,
    ...(style as CSSProperties | undefined),
  } as unknown as CSSProperties;

  return (
    <Box
      className={cx(S.logo, className)}
      role="status"
      aria-label="Metabot is thinking"
      data-testid={dataTestId}
      style={logoStyle}
      {...boxProps}
    >
      {Array.from({ length: GRID_ROWS }).flatMap((_, row) =>
        Array.from({ length: GRID_COLS }).map((_, col) => {
          const isLit = hasDot(mask, row, col, rowOffset, colOffset);
          return (
            <span
              key={`${row}-${col}`}
              className={cx(S.dot, isLit && S.lit)}
              // `--i` staggers both the dissolve and the idle pulse by grid
              // position, giving the mark a gentle diagonal sweep.
              style={{ "--i": row + col } as CSSProperties}
              aria-hidden={!isLit}
            />
          );
        }),
      )}
    </Box>
  );
};
