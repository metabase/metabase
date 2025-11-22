import cx from "classnames";
import { forwardRef } from "react";
import { isObject } from "underscore";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { Box, Icon } from "metabase/ui";
import { SidebarListItemContent } from "metabase-enterprise/transforms/pages/TransformSidebarLayout/SidebarListItem/SidebarListItem";
import type { Transform } from "metabase-types/api";

import S from "./TransformsTreeNode.module.css";

export const TransformsTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function TransformsTreeNode(
    {
      item,
      depth,
      isExpanded,
      isSelected,
      hasChildren,
      onSelect,
      onToggleExpand,
      ...props
    }: TreeNodeProps,
    ref,
  ) {
    const { name, icon } = item;
    const transform = item.data as Transform | undefined;

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

    const isLeaf = transform && !hasChildren;

    return (
      <TreeNode.Root
        role="menuitem"
        aria-label={name}
        tabIndex={0}
        onClick={onClick}
        {...props}
        className={cx(S.treeNode, props.className, {
          [S.isSelected]: isSelected,
          [S.isLeaf]: isLeaf,
        })}
        depth={depth}
        isSelected={isLeaf ? false : isSelected}
        aria-expanded={isExpanded}
        onKeyDown={handleKeyDown}
        ref={ref}
      >
        <TreeNode.ExpandToggleButton hidden={!hasChildren}>
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={10}
          />
        </TreeNode.ExpandToggleButton>

        {transform && !hasChildren ? (
          <Box p="sm" flex={1} className={S.leafContent}>
            <SidebarListItemContent
              label={transform.name}
              icon="table2"
              subtitle={transform.target.name}
              isActive={isSelected}
            />
          </Box>
        ) : (
          <>
            {icon && (
              <TreeNode.IconContainer transparent={false}>
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
      </TreeNode.Root>
    );
  },
);
