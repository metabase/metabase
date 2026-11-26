import { forgetShapes } from "skullet";

import { REMEMBERED_SKELETON_KEY_PREFIX } from "metabase/ui/utils/remembered-skeletons";

/**
 * Text as filler of the same length and letter case, as skullet stores it, so
 * a remembered layout keeps each line's length but none of its content.
 */
export const toSkeletonFiller = (text: string) =>
  text.replace(/\p{Lu}|\p{L}|\p{N}/gu, (char) =>
    /\p{Lu}/u.test(char) ? "X" : /\p{N}/u.test(char) ? "0" : "x",
  );

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
