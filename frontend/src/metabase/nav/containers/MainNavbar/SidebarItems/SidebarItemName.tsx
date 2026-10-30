import cx from "classnames";
import type { ReactElement } from "react";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import CS from "metabase/css/core/index.css";
import { type BoxProps, Tooltip } from "metabase/ui";

const ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD = 35;

function isLongItemName(itemName: string) {
  return itemName.length >= ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD;
}

interface LongItemNameTooltipProps {
  itemName: string;
  children: ReactElement;
}

/**
 * Shows the full name of an item with a long name, which `SidebarItemName`
 * truncates, and renders just `children` for any other name. Wrap the element
 * that takes keyboard focus, so the tooltip also opens on focus.
 */
export function LongItemNameTooltip({
  itemName,
  children,
}: LongItemNameTooltipProps) {
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
  const isLongName = isLongItemName(itemName);

  return (
    <TreeNode.NameContainer
      className={cx(
        isLongName && [CS.textNoWrap, CS.overflowHidden, CS.textEllipsis],
        className,
      )}
      miw={isLongName ? 0 : undefined}
      {...props}
    >
      {itemName}
    </TreeNode.NameContainer>
  );
}
