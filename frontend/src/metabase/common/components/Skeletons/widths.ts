// Uneven widths keep stacked skeleton lines from looking mechanically uniform.
// They're fixed rather than random so a skeleton doesn't reshuffle on re-render.
const SKELETON_LINE_WIDTHS = [
  "70%",
  "55%",
  "80%",
  "45%",
  "65%",
  "75%",
  "50%",
  "60%",
];

/** A natural-looking width for the line at `index` in a list of lines. */
export function getSkeletonLineWidth(index: number): string {
  return SKELETON_LINE_WIDTHS[index % SKELETON_LINE_WIDTHS.length];
}
