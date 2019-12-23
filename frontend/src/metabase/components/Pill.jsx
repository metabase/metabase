import React from "react";
import styled from "styled-components";
import { Box, Flex } from "grid-styled";
import { Absolute } from "metabase/components/Position";
import { background, color, display, space } from "styled-system";
import { color as metabaseColor } from "metabase/lib/colors";

export const Pill = styled.div`
  ${space};
  ${background};
  ${color};
  ${display};
  border-radius: 99px;
  font-weight: bold;
`;

Pill.defaultProps = {
  bg: metabaseColor("brand"),
  color: "white",
  p: 1,
  display: "inline-block",
};

export const PillWithAdornment = ({ left, right, ...props }) => {
  return (
    <Box className="inline-block relative">
      <Flex align="center">
        {left && (
          <Absolute left={0} pl={1}>
            {left}
          </Absolute>
        )}
        <Pill {...props} pl={left ? 3 : 2} pr={right ? 3 : 2} />
        {right && (
          <Absolute right={0} pr={1}>
            {right}
          </Absolute>
        )}
      </Flex>
    </Box>
  );
};
