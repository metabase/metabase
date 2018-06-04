import React from "react"
import { Fixed, Flex } from "rebass";
import Card from "metabase/components/Card";
import { Motion, spring } from "react-motion";

const BulkActionBar = ({ children, showing }) =>
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
      <Fixed bottom left right>
        <Card dark style={{ borderRadius: 0, opacity,
          transform: `translateY(${translateY}px)`,
        }}>
          <Flex align='center' py={2} px={2}>
            {children}
          </Flex>
        </Card>
      </Fixed>
    )}
  </Motion>

export default BulkActionBar
