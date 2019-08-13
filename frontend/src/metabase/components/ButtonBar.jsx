import React from "react";

import { Flex } from "grid-styled";

export default function ButtonBar({
  children,
  left = children,
  center,
  right,
  ...props
}) {
  if (Array.isArray(left) && left.length === 0) {
    left = null;
  }
  if (Array.isArray(center) && center.length === 0) {
    center = null;
  }
  if (Array.isArray(right) && right.length === 0) {
    right = null;
  }
  return (
    <Flex align="center" {...props}>
      <Flex
        align="center"
        justifyContent="flex-start"
        className={center ? "flex-full flex-basis-none" : "mr-auto"}
      >
        {left}
      </Flex>
      {center && <Flex align="center">{center}</Flex>}
      <Flex
        align="center"
        justifyContent="flex-end"
        className={center ? "flex-full flex-basis-none" : "ml-auto"}
      >
        {right}
      </Flex>
    </Flex>
  );
}
