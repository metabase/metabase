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

export function NotebookCellItem({ color, children }) {
  return (
    <Flex
      align="center"
      className="p1 text-bold mr1"
      style={{ borderRadius: 4, backgroundColor: color, color: "white" }}
    >
      {children}
    </Flex>
  );
}
