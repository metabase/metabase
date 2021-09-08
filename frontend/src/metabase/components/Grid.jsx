/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

export const GridItem = ({ children, width, px, py, ...props }) => (
  <Box px={px} py={py} {...props} width={width}>
    {children}
  </Box>
);

GridItem.defaultProps = {
  width: 1 / 4,
  px: 1,
  py: 1,
};

export const Grid = ({ children }) => (
  <Flex mx={-1} style={{ flexWrap: "wrap" }}>
    {children}
  </Flex>
);
