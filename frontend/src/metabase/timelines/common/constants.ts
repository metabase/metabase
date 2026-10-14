/**
 * 36rem, or Mantine's dialog cap on short viewports.
 * The outer calc stops Mantine's style props from converting the 2 to rem.
 */
export const MODAL_MIN_HEIGHT =
  "calc(min(36rem, 100dvh - 2 * var(--modal-y-offset)))";
