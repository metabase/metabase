import React from "react";

import { Flex } from "grid-styled";
import { alpha } from "metabase/lib/colors";

const DEFAULT_MAX_WIDTH = 780;

export default function NotebookCell({ color, children, style = {} }) {
  return (
    <Flex
      p={2}
      align="center"
      style={{
        borderRadius: 4,
        backgroundColor: alpha(color, 0.1),
        maxWidth: DEFAULT_MAX_WIDTH,
        ...style,
      }}
    >
      {children}
    </Flex>
  );
}

export function NotebookCellItem({ color, inactive, children }) {
  return (
    <Flex
      align="center"
      p={1}
      mr={1}
      className="text-bold"
      style={{
        border: "2px solid transparent",
        borderRadius: 4,
        color: inactive ? color : "white",
        backgroundColor: inactive ? "transparent" : color,
        borderColor: inactive ? alpha(color, 0.25) : "transparent",
      }}
    >
      {children}
    </Flex>
  );
}
