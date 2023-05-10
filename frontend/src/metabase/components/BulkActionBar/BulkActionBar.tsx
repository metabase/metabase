/* eslint-disable react/prop-types */
import React from "react";
import { Motion, spring } from "react-motion";

import { FixedBottomBar } from "./BulkActionBar.styled";

interface BulkActionBarProps {
  children: React.ReactNode;
  showing: boolean;
  isNavbarOpen: boolean;
}

const BulkActionBar = ({
  children,
  showing,
  isNavbarOpen,
}: BulkActionBarProps) => (
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
    {({ translateY }) => (
      <FixedBottomBar
        style={{
          transform: `translateY(${translateY}px)`,
        }}
        data-testid="bulk-action-bar"
        isNavbarOpen={isNavbarOpen}
      >
        {children}
      </FixedBottomBar>
    )}
  </Motion>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default BulkActionBar;
