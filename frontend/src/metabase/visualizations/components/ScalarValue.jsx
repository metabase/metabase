/*
 * Shared component for Scalar and SmartScalar to make sure our number presentation stays in sync
 */

import React from "react";

import { Flex } from "grid-styled";

export const ScalarWrapper = ({ children }) => (
  <Flex
    align="center"
    justify="center"
    flexDirection="column"
    className="full-height full flex-wrap relative"
    flex={1}
  >
    {children}
  </Flex>
);

const ScalarValue = ({ value, isFullscreen, isDashboard }) => (
  <h1 className="text-dark" style={{ fontSize: "2.8rem", fontWeight: 900 }}>
    {value}
  </h1>
);

export default ScalarValue;
