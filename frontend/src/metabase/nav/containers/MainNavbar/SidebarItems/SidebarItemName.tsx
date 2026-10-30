import cx from "classnames";
import type { ReactElement } from "react";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import CS from "metabase/css/core/index.css";
import { type BoxProps, Tooltip } from "metabase/ui";

const ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD = 35;

function isLongItemName(itemName: string) {
  return itemName.length >= ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD;
}

interface SidebarItemTooltipProps {
  itemName: string;
  children: ReactElement;
}

/**
 * Shows the full name of an item with a long name, which `SidebarItemName`
 * truncates. Wrap the element that takes keyboard focus, so the tooltip also
 * opens on focus.
 */
export function SidebarItemTooltip({
  itemName,
  children,
}: SidebarItemTooltipProps) {
  if (!isLongItemName(itemName)) {
    return children;
  }
  return (
    <Tooltip label={itemName} withArrow maw="65ch">
      {children}
    </Tooltip>
  );
}

interface SidebarItemNameProps extends BoxProps {
  children: string;
}

export function SidebarItemName({
  children: itemName,
  className,
  ...props
}: SidebarItemNameProps) {
  if (isLongItemName(itemName)) {
    return (
      <TreeNode.NameContainer
        className={cx(
          CS.textNoWrap,
          CS.overflowHidden,
          CS.textEllipsis,
          className,
        )}
        miw={0}
        {...props}
      >
        {itemName}
      </TreeNode.NameContainer>
    );
  }
  return (
    <TreeNode.NameContainer className={className} {...props}>
      {itemName}
    </TreeNode.NameContainer>
  );
}
