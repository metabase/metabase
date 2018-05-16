import React from "react";
import { Box, Flex } from "grid-styled";

export const GridItem = ({ children, w, px, py }) => (
  <Box w={w} px={px} py={py}>
    {children}
  </Box>
);

GridItem.defaultProps = {
  w: 1 / 4,
  px: 1,
  py: 1,
};

export const Grid = ({ children }) => (
  <Flex wrap mx={-2}>
    {children}
  </Flex>
);
