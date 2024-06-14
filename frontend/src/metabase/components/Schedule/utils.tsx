import type { ReactNode } from "react";
import { isValidElement } from "react";

import type { SelectProps } from "metabase/ui";
import { Box, Group } from "metabase/ui";

const placeholderRegex = /^\{([0-9])+\}$/;
export const addScheduleComponents = (
  str: string,
  components: ReactNode[],
): ReactNode => {
  const segments = str.split(/(?=\{)|(?<=\})/g).filter(part => part.trim());
  const arr = segments.map(segment => {
    const match = segment.match(placeholderRegex);
    return match ? components[parseInt(match[1])] : segment;
  });
  const withBlanks = addBlanks(arr);
  return withBlanks;
};

const addBlanks = (arr: ReactNode[]) => {
  const result: ReactNode[] = [];
  const addBlank = () => result.push(<Box></Box>);
  for (let c = 0; c < arr.length; c++) {
    const curr = arr[c];
    const next = arr[c + 1];
    const isLastItemString = c === arr.length - 1 && typeof curr === "string";
    if (isLastItemString) {
      addBlank();
      result.push(<Box mt="-.5rem">{curr}</Box>);
    } else {
      const isFirstItemString = c === 0 && typeof curr !== "string";
      if (isFirstItemString) {
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
    if (isValidElement(curr) && isValidElement(next)) {
      const canSelectsProbablyFitOnOneLine =
        curr.props.longestLabel.length + next.props.longestLabel.length < 24;
      if (canSelectsProbablyFitOnOneLine) {
        result[result.length - 1] = (
          <Group spacing="xs">
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

// HIIII
