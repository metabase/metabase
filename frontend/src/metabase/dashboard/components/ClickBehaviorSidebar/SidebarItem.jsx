/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import {
  BaseSidebarItemRoot,
  SelectableSidebarItemRoot,
} from "./SidebarItem.styled";

export const SidebarItemClasses =
  "border-brand-hover bordered border-transparent rounded flex align-center cursor-pointer overflow-hidden";

export const SidebarItemStyle = {
  paddingTop: 8,
  paddingBottom: 8,
  paddingLeft: 12,
  paddingRight: 12,
};

export const SidebarItemWrapper = ({ children, onClick, style, disabled }) => (
  <div
    className={cx(SidebarItemClasses, { disabled })}
    onClick={!disabled && onClick}
    style={{
      ...style,
    }}
  >
    {children}
  </div>
);

export function SidebarItem({ as = BaseSidebarItemRoot, ...props }) {
  const Element = as;
  return <Element {...props} />;
}

function SelectableSidebarItem(props) {
  return <SidebarItem {...props} as={SelectableSidebarItemRoot} />;
}

SidebarItem.Selectable = SelectableSidebarItem;
