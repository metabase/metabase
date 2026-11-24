import { forgetShapes } from "skullet";

/**
 * PROTOTYPE: the localStorage key prefix for what loading skeletons remember
 * of a user's pages beyond skullet's own shapes, such as dashboard layouts.
 */
export const REMEMBERED_SKELETON_KEY_PREFIX =
  "metabase-prototype-remembered-skeleton:";

/**
 * Text as filler of the same length and letter case, as skullet stores it, so
 * a remembered layout keeps each line's length but none of its content.
 */
export const toSkeletonFiller = (text: string) =>
  text
    .replace(/\p{Lu}/gu, "X")
    .replace(/\p{L}/gu, "x")
    .replace(/\p{N}/gu, "0");

/** Forgets every skeleton shape and layout remembered from the user's pages. */
export function forgetRememberedSkeletons() {
  forgetShapes();
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith(REMEMBERED_SKELETON_KEY_PREFIX))
      .forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Storage unavailable: nothing was remembered
  }
}
