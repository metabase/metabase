import type { ReactNode } from "react";
import { isValidElement } from "react";
import _ from "underscore";

import { measureTextWidth } from "metabase/lib/measure-text";
import type { SelectProps } from "metabase/ui";
import { Box, Group } from "metabase/ui";
import type { FontStyle } from "metabase/visualizations/shared/types/measure-text";

const placeholderRegex = /^\{(\d)+\}$/;

// https://regexr.com/83e7f
// Splitting on this regex includes the placeholders in the resulting array
const regexForSplittingOnPlaceholders = /(\{\d+\})/;

/** Takes a translated string containing placeholders and returns a JSX expression containing components substituted in for the placeholders */
export const fillScheduleTemplate = (
  /** A translated string containing placeholders, such as:
   * - "{0} {1} on {2} at {3}"
   * - "{0} {1} {2} à {3}" (a French example)
   * - "{1} {2} um {3} {0}" (a German example)
   */
  template: string,
  nodes: ReactNode[],
): ReactNode => {
  const segments = template
    .split(regexForSplittingOnPlaceholders)
    .filter(part => part.trim());
  const arr = segments.map(segment => {
    const match = segment.match(placeholderRegex);
    return match ? nodes[parseInt(match[1])] : segment.trim();
  });
  const simplifiedArray = combineConsecutiveStrings(arr);
  const laidOut = layoutSchedule(simplifiedArray);
  return laidOut;
};

const layoutSchedule = (nodes: ReactNode[]) => {
  const result: ReactNode[] = [];
  const addBlank = () =>
    result.push(<Box key={`blank-${result.length}`}></Box>);
  for (let c = 0; c < nodes.length; c++) {
    const curr = nodes[c];
    const next = nodes[c + 1];
    const nodeAfterNext = nodes[c + 2];
    const isLastNodeString = c === nodes.length - 1 && typeof curr === "string";
    const isCurrentNodeASelect = isValidElement(curr);
    const isNextNodeASelect = isValidElement(next);
    const isNodeAfterNextASelect = isValidElement(nodeAfterNext);
    if (isLastNodeString) {
      if (nodes.length === 2) {
        result[result.length - 1] = (
          <Group
            spacing="md"
            style={{ rowGap: ".35rem" }}
            key={`items-on-one-line`}
          >
            {result[result.length - 1]}
            {curr}
          </Group>
        );
      } else {
        addBlank();
        result.push(
          <Box key={curr} mt="-.5rem">
            {curr}
          </Box>,
        );
      }
    } else {
      const isFirstNodeString = c === 0 && typeof curr !== "string";
      if (isFirstNodeString) {
        addBlank();
      }
      if (typeof curr === "string") {
        const wrappedCurr = <Box style={{ textAlign: "end" }}>{curr}</Box>;
        result.push(wrappedCurr);
      } else {
        result.push(curr);
      }
    }
    // Insert blank nodes between adjacent Selects unless they can fit on one line
    if (isCurrentNodeASelect && isNextNodeASelect) {
      const canSelectsProbablyFitOnOneLine =
        measureTextWidthSafely(curr.props.longestLabel, 200) +
          measureTextWidthSafely(next.props.longestLabel, 200) <
        300;
      if (canSelectsProbablyFitOnOneLine) {
        result[result.length - 1] = (
          <Group style={{ gap: ".35rem" }} key={`selects-on-one-line`}>
            {result[result.length - 1]}
            {next}
          </Group>
        );
        if (isNodeAfterNextASelect) {
          addBlank();
        }
        c++;
      } else {
        addBlank();
      }
    }
  }
  return <>{result}</>;
};

export const combineConsecutiveStrings = (arr: ReactNode[]) => {
  return arr.reduce<ReactNode[]>((acc, node) => {
    const prevNode = _.last(acc);
    if (typeof node === "string" && typeof prevNode === "string") {
      acc[acc.length - 1] += ` ${node}`;
    } else {
      acc.push(node);
    }
    return acc;
  }, []);
};

export const getLongestSelectLabel = (data: SelectProps["data"]) =>
  data.reduce<string>((acc, option) => {
    const label = typeof option === "string" ? option : option.label || "";
    return label.length > acc.length ? label : acc;
  }, "");

/** Since measureTextWidth can throw an error, this function catches the error and returns a default width
 *
 * Note that you may want to set the style prop to reflect the currently chosen font family, like this:
 * ```
 *    const fontFamily = useSelector(state => getSetting(state, "application-font"));
 *    measureTextWidthSafely("string", 50, {family: fontFamily});
 * ```
 * */
export const measureTextWidthSafely = (
  text: string,
  defaultWidth: number,
  style?: Partial<FontStyle>,
) => {
  try {
    return measureTextWidth(text, style);
  } catch {
    return defaultWidth;
  }
};
