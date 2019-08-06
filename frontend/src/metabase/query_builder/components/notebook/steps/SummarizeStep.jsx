import React from "react";

import { Flex, Box } from "grid-styled";

import AggregateStep from "./AggregateStep";
import BreakoutStep from "./BreakoutStep";

export default function SummarizeStep({
  color,
  query,
  isLastOpened,
  ...props
}) {
  return (
    <Flex align="center">
      <Box width={1 / 2}>
        <AggregateStep
          color={color}
          query={query}
          isLastOpened={isLastOpened}
          {...props}
        />
      </Box>
      <Box mx={2} style={{ color }} className="text-bold">
        by
      </Box>
      <Box width={1 / 2}>
        <BreakoutStep color={color} query={query} {...props} />
      </Box>
    </Flex>
  );
}
