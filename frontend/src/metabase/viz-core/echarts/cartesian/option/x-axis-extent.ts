import type { Extent } from "../../../types";

export function getXAxisInsets(
  axisWidth: number,
  padding: number,
  firstLabelWidth: number,
  lastLabelWidth: number,
  intervalsCount: number,
  markWidthRatio: number,
  getMarkWidth?: (step: number) => number,
) {
  if (
    ![
      axisWidth,
      padding,
      firstLabelWidth,
      lastLabelWidth,
      intervalsCount,
      markWidthRatio,
    ].every(Number.isFinite) ||
    intervalsCount <= 0 ||
    padding < 0 ||
    firstLabelWidth < 0 ||
    lastLabelWidth < 0 ||
    markWidthRatio < 0 ||
    (firstLabelWidth + lastLabelWidth) / 2 + 2 * padding > axisWidth / 2
  ) {
    return undefined;
  }

  const availableWidth = axisWidth - 2 * padding;
  const firstHalfWidth = firstLabelWidth / 2;
  const lastHalfWidth = lastLabelWidth / 2;
  const halfMarkRatio = markWidthRatio / 2;
  let step = Math.min(
    (availableWidth - firstHalfWidth - lastHalfWidth) / intervalsCount,
    (availableWidth - firstHalfWidth) / (intervalsCount + halfMarkRatio),
    (availableWidth - lastHalfWidth) / (intervalsCount + halfMarkRatio),
    availableWidth / (intervalsCount + markWidthRatio),
  );

  if (getMarkWidth) {
    let lower = 0;
    let upper =
      (availableWidth - firstHalfWidth - lastHalfWidth) / intervalsCount;
    /** Clamped mark widths require solving the same containment equation numerically. */
    for (let iteration = 0; iteration < 32; iteration++) {
      const candidate = (lower + upper) / 2;
      const markWidth = getMarkWidth(candidate);
      if (!Number.isFinite(markWidth) || markWidth < 0) {
        return undefined;
      }
      const requiredWidth =
        intervalsCount * candidate +
        Math.max(firstHalfWidth, markWidth / 2) +
        Math.max(lastHalfWidth, markWidth / 2);
      if (requiredWidth > availableWidth) {
        upper = candidate;
      } else {
        lower = candidate;
      }
    }
    step = lower;
  }

  const markHalfWidth = (getMarkWidth?.(step) ?? markWidthRatio * step) / 2;
  const insetLeft = padding + Math.max(firstHalfWidth, markHalfWidth);
  const insetRight = padding + Math.max(lastHalfWidth, markHalfWidth);
  if (![step, insetLeft, insetRight].every(Number.isFinite) || step <= 0) {
    return undefined;
  }
  return { insetLeft, insetRight, step };
}

export function getXAxisExtentWithPadding(
  [min, max]: Extent,
  axisWidth: number,
  paddingLeft: number,
  paddingRight: number,
): Extent | undefined {
  if (
    ![min, max, axisWidth, paddingLeft, paddingRight].every(Number.isFinite) ||
    min >= max ||
    paddingLeft < 0 ||
    paddingRight < 0
  ) {
    return undefined;
  }

  const availableWidth = axisWidth - paddingLeft - paddingRight;
  if (availableWidth <= 0) {
    return undefined;
  }

  const unitsPerPixel = (max - min) / availableWidth;
  const paddedExtent: Extent = [
    min - paddingLeft * unitsPerPixel,
    max + paddingRight * unitsPerPixel,
  ];

  return paddedExtent.every(Number.isFinite) ? paddedExtent : undefined;
}
