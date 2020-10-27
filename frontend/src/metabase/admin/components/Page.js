import React from "react";
import { Box, Flex } from "grid-styled";

export const PageHeader = ({ children }) => (
  <Box bg="white" className="border-bottom" py={"22px"}>
    {children}
  </Box>
);

export const PageTabs = ({ children }) => <Box mt="14px">{children}</Box>;

export const PageTools = ({ children }) => (
  <Flex align="center">{children}</Flex>
);

export const PageActions = ({ children }) => (
  <Flex align="center" ml="auto">
    {children}
  </Flex>
);
