import cx from "classnames";
import type * as React from "react";

import type { IconProps } from "metabase/ui";
import { Box, Flex, Icon } from "metabase/ui";

import S from "./SidebarItem.module.css";
import {
  BaseSidebarItemRoot,
  Content,
  Name,
  SelectableSidebarItemRoot,
} from "./SidebarItemComponents";

function ItemIcon({ className, ...props }: { className?: string } & IconProps) {
  return (
    <Flex
      justify="center"
      align="center"
      w="36px"
      h="36px"
      mr="10px"
      className={cx(S.IconContainer, className)}
    >
      <Icon {...props} />
    </Flex>
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
    <Box
      p="md"
      ml="auto"
      component="span"
      className={cx(S.CloseIconContainer, className)}
      onClick={onClick}
    >
      <Icon name="close" />
    </Box>
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
