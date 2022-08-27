/* eslint-disable react/prop-types */
import React from "react";

import {
  BaseSidebarItemRoot,
  SelectableSidebarItemRoot,
} from "./SidebarItem.styled";

export function SidebarItem({ as = BaseSidebarItemRoot, ...props }) {
  const Element = as;
  return <Element {...props} />;
}

function SelectableSidebarItem(props) {
  return <SidebarItem {...props} as={SelectableSidebarItemRoot} />;
}

SidebarItem.Selectable = SelectableSidebarItem;
