import React from "react";
import { Box, Flex } from "grid-styled";
import Card from "metabase/components/Card";
import { Motion, spring } from "react-motion";

const FixedBottomBar = Box.extend`
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
`;

const BulkActionBar = ({ children, showing }) => (
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
      <FixedBottomBar>
        <Card
          style={{
            borderRadius: 0,
            opacity,
            transform: `translateY(${translateY}px)`,
          }}
        >
          <Flex align="center" py={2} px={4}>
            {children}
          </Flex>
        </Card>
      </FixedBottomBar>
    )}
  </Motion>
);

export default BulkActionBar;
