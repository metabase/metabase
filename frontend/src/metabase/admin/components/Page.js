import React from "react";
import { Box, Flex } from "grid-styled";
import styled from "styled-components";

export const PageHeader = ({ children }) => (
  <Box bg="white" className="border-bottom" py={"22px"}>
    {children}
  </Box>
);

export const PageTabs = ({ children }) => (
  <Box mt="14px" mb="-22px">
    <Box className="wrapper">{children}</Box>
  </Box>
);

export const PageTools = ({ children }) => (
  <Flex align="center" className="wrapper">
    {children}
  </Flex>
);

export const PageActions = ({ children }) => (
  <Flex align="center" ml="auto">
    {children}
  </Flex>
);

export const PageContent = styled(Box)`
  background-image: linear-gradient(to bottom, #f9fbfe, #fff);
`;
