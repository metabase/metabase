import React from "react";
import { Box, Flex } from "grid-styled";
import Icon from "metabase/components/Icon";

import { formatNumber } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

const SmartScalar = ({ period, title }) => {
  const isNegative = Math.sign(period["last-change"]) < 0;
  return (
    <Box>
      <h4
        style={{
          fontWeight: 900,
          textTransform: "uppercase",
          color: colors["text-medium"],
          fontSize: 12,
        }}
      >
        {title}
      </h4>
      <Box color={isNegative ? "red" : "green"}>
        <Flex is="h3" align="center">
          <Icon mr={1} name={isNegative ? "chevrondown" : "chevronup"} />
          {formatNumber(period["last-value"])}
          ({formatNumber(period["last-change"])}%)
        </Flex>
      </Box>
    </Box>
  );
};

export default SmartScalar;
