import cx from "classnames";
import { type ReactNode, forwardRef } from "react";
import { isObject } from "underscore";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { Icon } from "metabase/ui";

import S from "./ItemsListTreeNode.module.css";

interface ItemsListTreeNodeProps extends TreeNodeProps {
  renderLeaf?: (item: TreeNodeProps["item"]) => ReactNode;
}

export const ItemsListTreeNode = forwardRef<
  HTMLLIElement,
  ItemsListTreeNodeProps
>(function ItemsListTreeNode(
  {
    item,
    depth,
    isExpanded,
    isSelected,
    hasChildren,
    onSelect,
    onToggleExpand,
    rightSection,
    renderLeaf,
    ...props
  }: ItemsListTreeNodeProps,
  ref,
) {
  const { name, icon } = item;

  const iconProps = isObject(icon) ? icon : { name: icon };

  function onClick() {
    onSelect?.();
    onToggleExpand();
  }

  const handleKeyDown: React.KeyboardEventHandler = ({ key }) => {
    switch (key) {
      case "Enter":
        onClick();
        break;
      case "ArrowRight":
        !isExpanded && onToggleExpand();
        break;
      case "ArrowLeft":
        isExpanded && onToggleExpand();
        break;
    }
  };

  return (
    <TreeNode.Root
      role="menuitem"
      aria-label={name}
      tabIndex={0}
      onClick={onClick}
      {...props}
      className={cx(S.treeNode, props.className, props.classNames?.root, {
        [S.isSelected]: isSelected,
      })}
      depth={depth}
      isSelected={isSelected}
      aria-expanded={isExpanded}
      onKeyDown={handleKeyDown}
      ref={ref}
    >
      <TreeNode.ExpandToggleButton
        hidden={!hasChildren}
        className={props.classNames?.expandToggleButton}
      >
        <TreeNode.ExpandToggleIcon
          isExpanded={isExpanded}
          name="chevronright"
          size={10}
        />
      </TreeNode.ExpandToggleButton>

      {renderLeaf && !hasChildren ? (
        renderLeaf(item)
      ) : (
        <>
          {icon && (
            <TreeNode.IconContainer
              className={props.classNames?.iconContainer}
              transparent={false}
            >
              <Icon {...iconProps} />
            </TreeNode.IconContainer>
          )}
          <TreeNode.NameContainer
            data-testid="tree-item-name"
            className={S.nameContainer}
          >
            <Ellipsified>{name}</Ellipsified>
          </TreeNode.NameContainer>
        </>
      )}

      {rightSection?.(item)}
    </TreeNode.Root>
  );
});
