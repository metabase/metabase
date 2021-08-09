/* eslint-disable react/prop-types */
import React from "react";
import { Box, Flex } from "grid-styled";

export const GridItem = ({ children, w, px, py, ...props }) => (
  <Box px={px} py={py} {...props} width={w}>
    {children}
  </Box>
);

GridItem.defaultProps = {
  w: 1 / 4,
  px: 1,
  py: 1,
};

export const Grid = ({ children }) => (
  <Flex mx={-1} style={{ flexWrap: "wrap" }}>
    {children}
  </Flex>
);
