import cx from "classnames";
import { type CSSProperties, useEffect, useState } from "react";

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

const CENTER = { row: 1.5, col: 2 };

export type MetabotLoaderAnimation = "wave" | "ripple" | "assemble" | "breathe";

/** Special value that rotates through {@link CYCLE} on a timer. */
export type MetabotLoaderVariant = MetabotLoaderAnimation | "cycle";

/**
 * Per-animation start offset (ms) for each lit dot. This gives an animation its
 * sense of direction/origin; the keyframes live in the CSS module. `index` is
 * the lit dot's position in reading order (used by "assemble").
 */
const DELAY_BY_ANIMATION: Record<
  MetabotLoaderAnimation,
  (row: number, col: number, index: number) => number
> = {
  wave: (row, col) => (row + col) * 90,
  ripple: (row, col) => Math.hypot(row - CENTER.row, col - CENTER.col) * 150,
  assemble: (_row, _col, index) => index * 70,
  breathe: () => 0,
};

// "cycle" plays each of these in turn, pausing on a solid "M" between them.
const CYCLE: MetabotLoaderAnimation[] = ["wave", "ripple", "assemble"];
const PLAY_MS: Record<MetabotLoaderAnimation, number> = {
  wave: 2800,
  ripple: 3000,
  assemble: 2600,
  breathe: 2800,
};
const PAUSE_MS = 450;

const getMaskRows = (mask: MetabotLoaderMask) => mask.length;
const getMaskCols = (mask: MetabotLoaderMask) =>
  Math.max(...mask.map((row) => row.length));
const getMaskOffset = (outerSize: number, innerSize: number) =>
  Math.floor((outerSize - innerSize) / 2);
const hasDot = (
  mask: MetabotLoaderMask,
  row: number,
  col: number,
  rowOffset: number,
  colOffset: number,
) => mask[row - rowOffset]?.[col - colOffset] === 1;

/**
 * Drives the cycle state machine: returns the animation to play now, or `null`
 * during the brief pause between animations. A no-op when not cycling.
 */
const useAnimationCycle = (enabled: boolean): MetabotLoaderAnimation | null => {
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);

  const animation = CYCLE[step % CYCLE.length];

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const pauseAt = window.setTimeout(
      () => setPaused(true),
      PLAY_MS[animation],
    );
    const advanceAt = window.setTimeout(() => {
      setPaused(false);
      setStep((s) => s + 1);
    }, PLAY_MS[animation] + PAUSE_MS);
    return () => {
      window.clearTimeout(pauseAt);
      window.clearTimeout(advanceAt);
    };
  }, [enabled, step, animation]);

  if (!enabled) {
    return null;
  }
  return paused ? null : animation;
};

export interface MetabotLoaderProps extends BoxProps {
  /**
   * Animation style. Defaults to "cycle", which rotates through wave → ripple →
   * assemble with a short pause between each. Pass a single animation name to
   * pin it.
   */
  variant?: MetabotLoaderVariant;
  mask?: MetabotLoaderMask;
  morphFrom?: MetabotLoaderMask;
  status?: "started" | "ended";
  "data-testid"?: string;
}

/**
 * Animated "thinking" indicator for Metabot, drawn as the Metabase logo made of
 * dots. Replaces the generic three-dot spinner shown while a response streams.
 */
export const MetabotLoader = ({
  variant = "cycle",
  mask = METABOT_LOGO_MASK,
  morphFrom,
  status = "started",
  "data-testid": dataTestId = "metabot-response-loader",
  className,
  style,
  ...boxProps
}: MetabotLoaderProps) => {
  const isMorphing = morphFrom != null;
  const cycled = useAnimationCycle(!isMorphing && variant === "cycle");

  // when cycling, `cycled` is the active animation (or null during the pause);
  // otherwise the variant is the animation itself
  const animation: MetabotLoaderAnimation | null = isMorphing
    ? null
    : variant === "cycle"
      ? cycled
      : variant;

  const getDelay = animation ? DELAY_BY_ANIMATION[animation] : null;
  const sourceMask = morphFrom ?? mask;
  const rows = Math.max(6, getMaskRows(mask), getMaskRows(sourceMask));
  const cols = Math.max(7, getMaskCols(mask), getMaskCols(sourceMask));
  const targetRowOffset = getMaskOffset(rows, getMaskRows(mask));
  const targetColOffset = getMaskOffset(cols, getMaskCols(mask));
  const sourceRowOffset = getMaskOffset(rows, getMaskRows(sourceMask));
  const sourceColOffset = getMaskOffset(cols, getMaskCols(sourceMask));
  const logoStyle = {
    "--cols": cols,
    "--rows": rows,
    ...(style as CSSProperties | undefined),
  } as unknown as CSSProperties;

  // lit dots are numbered in reading order so "assemble" can stagger them
  let litIndex = -1;

  return (
    <Box
      className={cx(
        S.logo,
        animation && S[animation],
        isMorphing && (status === "started" ? S.morphing : S.settled),
        className,
      )}
      role="status"
      aria-label="Metabot is thinking"
      data-testid={dataTestId}
      style={logoStyle}
      {...boxProps}
    >
      {Array.from({ length: rows }).flatMap((_, row) =>
        Array.from({ length: cols }).map((_, col) => {
          const isTargetDot = hasDot(
            mask,
            row,
            col,
            targetRowOffset,
            targetColOffset,
          );
          const isSourceDot = hasDot(
            sourceMask,
            row,
            col,
            sourceRowOffset,
            sourceColOffset,
          );
          const isLit = isMorphing ? isTargetDot || isSourceDot : isTargetDot;
          const isSharedDot = isMorphing && isTargetDot && isSourceDot;
          if (!isMorphing && isLit) {
            litIndex += 1;
          }
          const delay = (row + col) * 45;
          return (
            <span
              key={`${row}-${col}`}
              className={cx(
                S.dot,
                isMorphing
                  ? {
                      [S.target]: isTargetDot,
                      [S.source]: isSourceDot && !isTargetDot,
                      [S.shared]: isSharedDot,
                    }
                  : isLit
                    ? S.lit
                    : S.empty,
                !isLit && S.empty,
              )}
              style={
                isMorphing
                  ? ({ "--delay": `${delay}ms` } as CSSProperties)
                  : isLit && getDelay
                    ? {
                        animationDelay: `${getDelay(row, col, litIndex)}ms`,
                      }
                    : undefined
              }
              aria-hidden={isMorphing ? !(isTargetDot || isSourceDot) : !isLit}
            />
          );
        }),
      )}
    </Box>
  );
};
