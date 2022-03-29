/* eslint-disable react/prop-types */
import React from "react";
import styled from "@emotion/styled";
import Card from "metabase/components/Card";
import { Motion, spring } from "react-motion";

import { SIDEBAR_WIDTH } from "metabase/collections/constants";

const FixedBottomBar = styled.div`
  position: fixed;
  bottom: 0;
  left: ${props => (props.isNavbarOpen ? SIDEBAR_WIDTH : 0)};
  right: 0;
`;

const BulkActionBar = ({ children, showing, isNavbarOpen }) => (
  <Motion
    defaultStyle={{
      opacity: 0,
      translateY: 100,
    }}
    style={{
      opacity: showing ? spring(1) : spring(0),
      translateY: showing ? spring(0) : spring(100),
    }}
  >
    {({ opacity, translateY }) => (
      <FixedBottomBar
        style={{
          borderRadius: 0,
          opacity,
          transform: `translateY(${translateY}px)`,
        }}
        data-testid="bulk-action-bar"
        isNavbarOpen={isNavbarOpen}
      >
        <Card>{children}</Card>
      </FixedBottomBar>
    )}
  </Motion>
);

export default BulkActionBar;
