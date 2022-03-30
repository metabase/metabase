/* eslint-disable react/prop-types */
import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import {
  TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
} from "./TreeNode.styled";
import { TreeNodeProps } from "./types";

// eslint-disable-next-line react/display-name
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
        tabIndex={0}
        onClick={onClick}
        {...props}
        depth={depth}
        isSelected={isSelected}
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
        <NameContainer>{name}</NameContainer>
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
