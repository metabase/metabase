import type { ReactNode } from "react";
import { isValidElement } from "react";

import type { SelectProps } from "metabase/ui";
import { Box, Group } from "metabase/ui";

const placeholderRegex = /^\{(\d)+\}$/;

// https://regexr.com/83e7f
// Splitting on this regex includes the placeholders in the resulting array
const regexForSplittingOnPlaceholders = /(\{\d+\})/;

/** Takes a translated string containing placeholders and returns a JSX expression containing components substituted in for the placeholders */
export const addScheduleComponents = (
  /** A translated string containing placeholders, such as:
   * - "{0} {1} on {2} at {3}"
   * - "{0} {1} {2} à {3}" (a French example)
   * - "{1} {2} um {3} {0}" (a German example)
   */
  str: string,
  components: ReactNode[],
): ReactNode => {
  const segments = str
    .split(regexForSplittingOnPlaceholders)
    .filter(part => part.trim());
  const arr = segments.map(segment => {
    const match = segment.match(placeholderRegex);
    return match ? components[parseInt(match[1])] : segment;
  });
  const withBlanks = addBlanks(arr);
  return withBlanks;
};

const addBlanks = (arr: ReactNode[]) => {
  const result: ReactNode[] = [];
  const addBlank = () =>
    result.push(<Box key={`blank-${result.length}`}></Box>);
  for (let c = 0; c < arr.length; c++) {
    const curr = arr[c];
    const next = arr[c + 1];
    const isLastItemString = c === arr.length - 1 && typeof curr === "string";
    if (isLastItemString) {
      addBlank();
      result.push(
        <Box key={curr} mt="-.5rem">
          {curr}
        </Box>,
      );
    } else {
      const isFirstItemString = c === 0 && typeof curr !== "string";
      if (isFirstItemString) {
        addBlank();
      }
      if (typeof curr === "string") {
        const wrappedCurr = (
          <Box key={`wrapped-${curr}`} style={{ textAlign: "end" }}>
            {curr}
          </Box>
        );
        result.push(wrappedCurr);
      } else {
        result.push(curr);
      }
    }
    // Insert blank nodes between adjacent Selects unless they can fit on one line
    if (isValidElement(curr) && isValidElement(next)) {
      const canSelectsProbablyFitOnOneLine =
        (curr.props.longestLabel?.length || 5) +
          (next.props.longestLabel?.length || 5) <
        24;
      if (canSelectsProbablyFitOnOneLine) {
        result[result.length - 1] = (
          <Group spacing="xs" key={`selects-on-one-line`}>
            {result[result.length - 1]}
            {next}
          </Group>
        );
        c++;
      } else {
        addBlank();
      }
    }
  }
  return <>{result}</>;
};

export const getLongestSelectLabel = (data: SelectProps["data"]) =>
  data.reduce((acc, option) => {
    const label = typeof option === "string" ? option : option.label || "";
    return label.length > acc.length ? label : acc;
  }, "");
