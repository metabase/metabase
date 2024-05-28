import type * as React from "react";

import type { IconProps } from "metabase/ui";
import { Icon } from "metabase/ui";

import {
  Name,
  Content,
  IconContainer,
  CloseIconContainer,
  BaseSidebarItemRoot,
  SelectableSidebarItemRoot,
} from "./SidebarItem.styled";

function ItemIcon({ className, ...props }: { className?: string } & IconProps) {
  return (
    <IconContainer className={className}>
      <Icon {...props} />
    </IconContainer>
  );
}

function CloseIcon({
  className,
  onClick,
}: {
  className?: string;
  onClick?: React.MouseEventHandler;
}) {
  return (
    <CloseIconContainer className={className} onClick={onClick}>
      <Icon name="close" />
    </CloseIconContainer>
  );
}

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ComponentType<any>;
  disabled?: boolean;
  padded?: boolean;
  children: React.ReactNode;
}

export function SidebarItem({
  as = BaseSidebarItemRoot,
  ...props
}: SidebarItemProps) {
  const Element = as;
  return <Element {...props} />;
}

interface SelectableSidebarItem extends Omit<SidebarItemProps, "as"> {
  isSelected: boolean;
}

function SelectableSidebarItem(props: SelectableSidebarItem) {
  return (
    <SidebarItem
      {...props}
      as={SelectableSidebarItemRoot}
      aria-selected={props.isSelected}
    />
  );
}

SidebarItem.Selectable = SelectableSidebarItem;

SidebarItem.Content = Content;
SidebarItem.Name = Name;
SidebarItem.Icon = ItemIcon;
SidebarItem.CloseIcon = CloseIcon;
