/* eslint-disable react/prop-types */
import * as React from "react";
import _ from "underscore";

import { Icon } from "metabase/ui";

import {
  TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
} from "./TreeNode.styled";
import type { TreeNodeProps } from "./types";

const BaseTreeNode = React.memo(
  React.forwardRef<HTMLLIElement, TreeNodeProps>(function TreeNode(
    {
      item,
      depth,
      isExpanded,
      isSelected,
      hasChildren,
      onSelect,
      onToggleExpand,
      ...props
    },
    ref,
  ) {
    const { name, icon } = item;

    const iconProps = _.isObject(icon) ? icon : { name: icon };

    function onClick() {
      onSelect?.();
      onToggleExpand();
    }

    const handleKeyDown: React.KeyboardEventHandler = ({ key }) => {
      switch (key) {
        case "Enter":
          onSelect?.();
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
      <TreeNodeRoot
        role="menuitem"
        aria-label={name}
        tabIndex={0}
        onClick={onClick}
        {...props}
        depth={depth}
        isSelected={isSelected}
        aria-selected={isSelected}
        aria-expanded={isExpanded}
        onKeyDown={handleKeyDown}
        ref={ref}
      >
        <ExpandToggleButton hidden={!hasChildren}>
          <ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </ExpandToggleButton>

        {icon && (
          <IconContainer>
            <Icon {...iconProps} />
          </IconContainer>
        )}
        <NameContainer data-testid="tree-item-name">{name}</NameContainer>
      </TreeNodeRoot>
    );
  }),
);

export const TreeNode = Object.assign(BaseTreeNode, {
  Root: TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
});
