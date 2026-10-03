import type { ReactNode } from "react";

import type { SelectProps } from "metabase/ui";
import { measureTextWidth } from "metabase/utils/measure-text";
import { memoize } from "metabase/utils/memoize";

export const combineConsecutiveStrings = (arr: ReactNode[]) => {
  return arr.reduce<ReactNode[]>((acc, node) => {
    const previousNode = acc.at(-1);
    if (typeof node === "string" && typeof previousNode === "string") {
      return [...acc.slice(0, acc.length - 1), previousNode + ` ${node}`];
    }
    if (typeof node === "string" && !node.trim()) {
      return acc;
    }
    return [...acc, typeof node === "string" ? node.trim() : node];
  }, []);
};

export const getLongestSelectLabel = (
  data: SelectProps<string | null>["data"] | { value: string }[] = [],
  fontFamily?: string,
): string => {
  const width = (str: string) =>
    measureTextWidthSafely(str, str.length, fontFamily);
  return [...data].reduce<string>((acc: string, option) => {
    let label: string;
    if (typeof option === "string") {
      label = option;
    } else if (!option) {
      label = "";
    } else if ("label" in option) {
      label = option.label;
    } else if ("group" in option) {
      label = getLongestSelectLabel(option.items);
    } else {
      label = "";
    }
    return width(label) > width(acc) ? label : acc;
  }, "");
};

/**
 * measureTextWidth can throw, so this returns defaultWidth instead.
 *
 * Pass the currently chosen font family:
 * ```
 *    const fontFamily = useSelector(state => getSetting(state, "application-font"));
 *    measureTextWidthSafely("string", 50, fontFamily);
 * ```
 *
 * The arguments are all primitives on purpose. The cache matches them by value,
 * and they come from a fixed set of schedule labels, so it cannot grow with
 * anything the user does.
 */
// eslint-disable-next-line metabase/no-module-level-memoize
export const measureTextWidthSafely = memoize(
  (text: string, defaultWidth: number, fontFamily?: string) => {
    try {
      return measureTextWidth(text, { family: fontFamily });
    } catch (e) {
      console.error(`Error while measuring text width:`, e);
      return defaultWidth;
    }
  },
);
