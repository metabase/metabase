import React from "react";

import { t } from "ttag";
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
    <Flex align="center" flexDirection={["column", "row"]}>
      <Box width={[1, 1 / 2]}>
        <AggregateStep
          color={color}
          query={query}
          isLastOpened={isLastOpened}
          {...props}
        />
      </Box>
      <Box mx={[0, 2]} my={[1, 0]} style={{ color }} className="text-bold">
        {t`by`}
      </Box>
      <Box width={[1, 1 / 2]}>
        <BreakoutStep color={color} query={query} {...props} />
      </Box>
    </Flex>
  );
}
