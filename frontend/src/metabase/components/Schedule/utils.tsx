import type { ReactNode } from "react";
import { isValidElement } from "react";
import _ from "underscore";

import { measureTextWidth } from "metabase/lib/measure-text";
import type { SelectProps } from "metabase/ui";
import { Box, Group } from "metabase/ui";

const placeholderRegex = /^\{([0-9])+\}$/;

/** Fill out a schedule template string with nodes (i.e., strings and components) */
export const fillScheduleTemplate = (
  template: string,
  nodes: ReactNode[],
): ReactNode => {
  const segments = template
    .split(/(?=\{)|(?<=\})/g)
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
    if (isCurrentNodeASelect && isNextNodeASelect) {
      const canSelectsProbablyFitOnOneLine =
        measureTextWidth(curr.props.longestLabel) +
          measureTextWidth(next.props.longestLabel) <
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
