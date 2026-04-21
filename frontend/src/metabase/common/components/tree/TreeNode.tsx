import * as React from "react";
import _ from "underscore";

import { Icon } from "metabase/ui";

import {
  ExpandToggleButton,
  ExpandToggleIcon,
  IconContainer,
  NameContainer,
  TreeNodeRoot,
} from "./TreeNode.styled";
import type { TreeNodeProps } from "./types";

const BaseTreeNode = React.forwardRef<HTMLLIElement, TreeNodeProps>(
  function TreeNode(
    {
      item,
      depth,
      isExpanded,
      isSelected,
      hasChildren,
      onSelect,
      onToggleExpand,
      rightSection,
      ...props
    }: TreeNodeProps,
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
          if (!isExpanded) {
            onToggleExpand();
          }
          break;
        case "ArrowLeft":
          if (isExpanded) {
            onToggleExpand();
          }
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
        {rightSection?.(item)}
      </TreeNodeRoot>
    );
  },
);

export const TreeNode = Object.assign(React.memo(BaseTreeNode), {
  Root: TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
});
