import React from "react";
import { Box, Flex } from "grid-styled";
import Subhead from "metabase/components/Subhead";

export const Wrapper = ({ children }) => (
  <Box w="80%" ml="auto" mr="auto">
    {children}
  </Box>
);

export const Canvas = ({ children }) => (
  <Box
    bg="#FCFDFD"
    p={2}
    style={{
      borderTop: "#F4F5F6",
      borderBottom: "#F5F5F6",
    }}
  >
    {children}
  </Box>
);

export const Section = ({ children }) => <Box py={4}>{children}</Box>;

export const SectionHeading = ({ children }) => (
  <Box bottom mb={3} pb={2}>
    <Flex align="center">
      <Subhead>{children}</Subhead>
    </Flex>
  </Box>
);

export const PageHeading = ({ icon, title }) => (
  <Flex align="center" my={3}>
    {icon}
    <h1 ml={2}>{title}</h1>
  </Flex>
);

export const PageLayout = ({ children }) => (
  <Box w={2 / 3}>
    <Box w="70%">{children}</Box>
  </Box>
);

export const PageSidebar = ({ children }) => <Box w={1 / 3}>{children}</Box>;
