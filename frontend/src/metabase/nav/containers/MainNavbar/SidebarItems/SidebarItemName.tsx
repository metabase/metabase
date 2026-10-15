import cx from "classnames";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import CS from "metabase/css/core/index.css";
import { type BoxProps, Tooltip } from "metabase/ui";

const ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD = 35;

interface SidebarItemNameProps extends BoxProps {
  children: string;
}

export function SidebarItemName({
  children: itemName,
  className,
  ...props
}: SidebarItemNameProps) {
  if (itemName.length >= ITEM_NAME_LENGTH_TOOLTIP_THRESHOLD) {
    return (
      <Tooltip label={itemName} withArrow maw="none">
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
      </Tooltip>
    );
  }
  return (
    <TreeNode.NameContainer className={className} {...props}>
      {itemName}
    </TreeNode.NameContainer>
  );
}
