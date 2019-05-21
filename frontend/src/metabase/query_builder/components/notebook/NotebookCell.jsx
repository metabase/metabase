import React from "react";

import { Flex } from "grid-styled";

import Icon from "metabase/components/Icon";

import { alpha } from "metabase/lib/colors";

export default function NotebookCell({ color, children, style = {} }) {
  return (
    <Flex
      p={2}
      align="center"
      style={{
        borderRadius: 8,
        backgroundColor: alpha(color, 0.1),
        ...style,
      }}
    >
      {children}
    </Flex>
  );
}

export function NotebookCellItem({ color, icon, inactive, children }) {
  return (
    <Flex
      align="center"
      p={1}
      mr={1}
      className="text-bold"
      style={{
        border: "2px solid transparent",
        borderRadius: 6,
        color: inactive ? color : "white",
        backgroundColor: inactive ? "transparent" : color,
        borderColor: inactive ? alpha(color, 0.25) : "transparent",
      }}
    >
      {icon && <Icon className="mr1" name={icon} size={12} />}
      {children}
    </Flex>
  );
}
