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
export const TreeNode = React.memo(
  React.forwardRef<HTMLLIElement, TreeNodeProps>(function TreeNode(
    { isExpanded, isSelected, hasChildren, onToggleExpand, depth, item },
    ref,
  ) {
    const { name, icon } = item;

    const iconProps = _.isObject(icon) ? icon : { name: icon };

    const handleKeyDown: React.KeyboardEventHandler = ({ key }) => {
      switch (key) {
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
        ref={ref}
        role="menuitem"
        tabIndex={0}
        depth={depth}
        onClick={onToggleExpand}
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
