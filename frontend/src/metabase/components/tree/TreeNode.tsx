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
import { ITreeNodeItem } from "./types";

export interface TreeNodeProps {
  item: ITreeNodeItem;
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  colorScheme: "default" | "admin";
  onSelect: (item: ITreeNodeItem) => void;
  onToggleExpand: (id: ITreeNodeItem["id"]) => void;
}

// eslint-disable-next-line react/display-name
export const TreeNode = React.memo(
  React.forwardRef<HTMLLIElement, TreeNodeProps>(function TreeNode(
    {
      isExpanded,
      isSelected,
      hasChildren,
      onToggleExpand,
      onSelect,
      depth,
      item,
      colorScheme,
    },
    ref,
  ) {
    const { name, icon, id } = item;

    const iconProps = _.isObject(icon) ? icon : { name: icon };

    const handleSelect = () => {
      onSelect(item);
      onToggleExpand(id);
    };

    const handleKeyDown: React.KeyboardEventHandler = ({ key }) => {
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
        ref={ref}
        role="menuitem"
        tabIndex={0}
        colorScheme={colorScheme}
        depth={depth}
        onClick={handleSelect}
        isSelected={isSelected}
        onKeyDown={handleKeyDown}
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
