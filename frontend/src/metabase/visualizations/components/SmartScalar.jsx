import React from "react";
import { Box, Flex } from "grid-styled";

import { formatNumber } from "metabase/lib/formatting";
import colors from "metabase/lib/colors";

const SmartScalar = ({ value, change = null, title }) => {
  const isNegative = (change && Math.sign(change) < 0) || false;
  return (
    <Box>
      {title && (
        <h4
          style={{
            fontWeight: 900,
            textTransform: "uppercase",
            color: colors["text-medium"],
            fontSize: 11,
            letterSpacing: 0.24,
          }}
        >
          {title}
        </h4>
      )}
      <Box
        color={
          !change
            ? colors["text-dark"]
            : isNegative ? colors["error"] : colors["success"]
        }
      >
        <Flex align="center" style={{ fontWeight: 900 }}>
          <h4 style={{ fontWeight: 900 }}>
            {value && formatNumber(value)}
            {change && `${formatNumber(change)}%`}
          </h4>
        </Flex>
      </Box>
    </Box>
  );
};

export default SmartScalar;
