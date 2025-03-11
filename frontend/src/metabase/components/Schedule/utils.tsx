import type { ReactNode } from "react";
import _ from "underscore";

import { measureTextWidth } from "metabase/lib/measure-text";
import type { SelectProps } from "metabase/ui";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";

export const combineConsecutiveStrings = (arr: ReactNode[]) => {
  return arr.reduce<ReactNode[]>((acc, node) => {
    const prevNode = _.last(acc);
    if (typeof node === "string" && typeof prevNode === "string") {
      acc[acc.length - 1] += ` ${node}`;
    } else {
      if (typeof node === "string" && !node.trim()) {
        return acc;
      }
      acc.push(node);
    }
    return acc;
  }, []);
};

export const getLongestSelectLabel = (
  data: SelectProps["data"] | { value: string }[] = [],
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

export const removeCommasFromTranslation = (translation: string | string[]) =>
  typeof translation === "string"
    ? translation.replace(/,/g, "")
    : translation.map(t => t.replace(/,/g, ""));
