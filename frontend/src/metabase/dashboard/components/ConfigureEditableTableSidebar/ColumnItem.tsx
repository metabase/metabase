import cx from "classnames";
import type { ReactNode } from "react";

import CS from "metabase/css/core/index.css";
import type { IconProps } from "metabase/ui";
import { Flex, Group, Icon, Text } from "metabase/ui";

import ColumnItemS from "./ColumnItem.module.css";

export interface ColumnItemProps {
  className?: string;
  title: string;
  role?: string;
  draggable: boolean;
  icon?: IconProps["name"];
  children: ReactNode;
  onClick?: () => void;
}

export const ColumnItem = ({
  className,
  title,
  role,
  draggable = false,
  icon,
  children,
  onClick,
}: ColumnItemProps) => (
  <Flex
    w="100%"
    bg="bg-white"
    c="text-medium"
    className={cx(
      CS.overflowHidden,
      CS.bordered,
      CS.rounded,
      ColumnItemS.ColumnItemRoot,
      {
        [cx(ColumnItemS.Draggable, CS.cursorGrab)]: draggable,
      },
      className,
    )}
    role={role}
    onClick={onClick}
    aria-label={role ? title : undefined}
    data-testid={draggable ? `draggable-item-${title}` : null}
    px="sm"
    py="xs"
    my="sm"
  >
    <Group wrap="nowrap" gap="xs" p="xs">
      {draggable && (
        <Icon
          className={cx(CS.flexNoShrink, ColumnItemS.ColumnItemDragHandle)}
          name="grabber"
        />
      )}
    </Group>
    <Group className={CS.flex1} px="xs" wrap="nowrap">
      {icon && <Icon name={icon} className={CS.flexNoShrink} />}
      <Text lh="normal" fw="bold" className={CS.textWrap}>
        {title}
      </Text>
    </Group>
    <Group wrap="nowrap" gap="sm" p="xs">
      {children}
    </Group>
  </Flex>
);
