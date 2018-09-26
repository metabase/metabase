import React from "react";
import { Position, Absolute, Relative } from "metabase/components/Position";

export const component = Position;

export const description = `
Use Absolute, Fixed, Sticky, and Relative to help position items easily.
Any props that work on Box and Flex work here.
`;

export const examples = {
  Relative: <Relative>Some content relative to its parent</Relative>,
  Absolute: (
    <Relative p={4} w="100%">
      Some content
      <Absolute bg="red" p={1} top={0} right={0}>
        Some content positioned absolutely to its parent
      </Absolute>
    </Relative>
  ),
};
