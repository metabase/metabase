/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";

import {
  Name,
  Content,
  IconContainer,
  CloseIconContainer,
  BaseSidebarItemRoot,
  SelectableSidebarItemRoot,
} from "./SidebarItem.styled";

function ItemIcon({ className, ...props }) {
  return (
    <IconContainer className={className}>
      <Icon {...props} />
    </IconContainer>
  );
}

function CloseIcon({ className, onClick }) {
  return (
    <CloseIconContainer className={className} onClick={onClick}>
      <Icon name="close" size={12} />
    </CloseIconContainer>
  );
}

export function SidebarItem({ as = BaseSidebarItemRoot, ...props }) {
  const Element = as;
  return <Element {...props} />;
}

function SelectableSidebarItem(props) {
  return <SidebarItem {...props} as={SelectableSidebarItemRoot} />;
}

SidebarItem.Selectable = SelectableSidebarItem;

SidebarItem.Content = Content;
SidebarItem.Name = Name;
SidebarItem.Icon = ItemIcon;
SidebarItem.CloseIcon = CloseIcon;
