import React from "react";
import _ from "underscore";

import Icon from "metabase/components/Icon";

import {
  TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
  RightArrowContainer,
} from "./TreeNode.styled";
import { TreeColorScheme, TreeItem, TreeNodeId } from "./types";

interface TreeNodeProps {
  isExpanded: boolean;
  isSelected: boolean;
  hasChildren: boolean;
  onToggleExpand: (id: TreeNodeId) => void;
  onSelect: (item: TreeItem) => void;
  depth: number;
  item: TreeItem;
  colorScheme: TreeColorScheme;
}

// eslint-disable-next-line react/display-name
export const TreeNode = React.memo(
  React.forwardRef(function TreeNode(
    {
      isExpanded,
      isSelected,
      hasChildren,
      onToggleExpand,
      onSelect,
      depth,
      item,
      colorScheme,
    }: TreeNodeProps,
    ref,
  ) {
    const { name, icon, hasRightArrow, id } = item;

    const iconProps = _.isObject(icon) ? icon : { name: icon };

    const handleSelect = () => {
      onSelect(item);
      onToggleExpand(id);
    };

    const handleKeyDown = ({ key }: React.KeyboardEvent<HTMLElement>) => {
      switch (key) {
        case "Enter":
          onSelect(item);
          break;
        case "ArrowRight":
          !isExpanded && onToggleExpand(id);
          break;
        case "ArrowLeft":
          isExpanded && onToggleExpand(id);
          break;
      }
    };

    return (
      <TreeNodeRoot
        innerRef={ref as any}
        role="menuitem"
        tabIndex={0}
        colorScheme={colorScheme}
        depth={depth}
        onClick={handleSelect}
        isSelected={isSelected}
        onKeyDown={handleKeyDown}
      >
        <ExpandToggleButton hidden={!hasChildren}>
          <ExpandToggleIcon isExpanded={isExpanded} />
        </ExpandToggleButton>

        {icon && (
          <IconContainer>
            <Icon {...iconProps} />
          </IconContainer>
        )}
        <NameContainer>{name}</NameContainer>

        {hasRightArrow && (
          <RightArrowContainer
            isSelected={isSelected}
            colorScheme={colorScheme}
          >
            <Icon name="chevronright" size={14} />
          </RightArrowContainer>
        )}
      </TreeNodeRoot>
    );
  }),
);
