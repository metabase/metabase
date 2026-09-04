import type { ReactNode } from "react";
import _ from "underscore";

import type { SelectProps } from "metabase/ui";
import type { FontStyle } from "metabase/utils/measure-text";
import { measureTextWidth } from "metabase/utils/measure-text";

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
    measureTextWidthSafely(str, str.length, { family: fontFamily });
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

/** Since measureTextWidth can throw an error, this function catches the error and returns a default width
 *
 * Note that you may want to set the style prop to reflect the currently chosen font family, like this:
 * ```
 *    const fontFamily = useSelector(state => getSetting(state, "application-font"));
 *    measureTextWidthSafely("string", 50, {family: fontFamily});
 * ```
 * */
// The cache is keyed on a schedule option label and a font style. Both come
// from a fixed set, so it cannot grow with anything the user does.
// eslint-disable-next-line metabase/no-module-level-memoize
export const measureTextWidthSafely = _.memoize(
  (text: string, defaultWidth: number, style?: Partial<FontStyle>) => {
    try {
      return measureTextWidth(text, style);
    } catch (e) {
      console.error(`Error while measuring text width:`, e);
      return defaultWidth;
    }
  },
  function hashFunction(...args) {
    return JSON.stringify(args);
  },
);
