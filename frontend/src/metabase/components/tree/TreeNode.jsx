import React from "react";
import PropTypes from "prop-types";
import {
  TreeNodeRoot,
  ExpandToggleButton,
  ExpandToggleIcon,
  NameContainer,
  IconContainer,
  RightArrowContainer,
} from "./TreeNode.styled";

import Icon from "metabase/components/Icon";

const propTypes = {
  isExpanded: PropTypes.bool.isRequired,
  isSelected: PropTypes.bool.isRequired,
  hasChildren: PropTypes.bool.isRequired,
  onToggleExpand: PropTypes.func,
  onSelect: PropTypes.func.isRequired,
  depth: PropTypes.number.isRequired,
  item: PropTypes.shape({
    name: PropTypes.string.isRequired,
    icon: PropTypes.string,
    hasRightArrow: PropTypes.string,
    id: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  }).isRequired,
  variant: PropTypes.string,
};

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
      variant,
    },
    ref,
  ) {
    const { name, icon, hasRightArrow, id } = item;

    const handleSelect = () => {
      onSelect(item);
      onToggleExpand(id);
    };

    const handleKeyDown = ({ key }) => {
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
        innerRef={ref}
        role="menuitem"
        tabIndex={0}
        variant={variant}
        depth={depth}
        onClick={handleSelect}
        isSelected={isSelected}
        onKeyDown={handleKeyDown}
      >
        <ExpandToggleButton hidden={!hasChildren}>
          <ExpandToggleIcon isExpanded={isExpanded} />
        </ExpandToggleButton>

        {icon && (
          <IconContainer variant={variant}>
            <Icon name={icon} />
          </IconContainer>
        )}
        <NameContainer>{name}</NameContainer>

        {hasRightArrow && (
          <RightArrowContainer isSelected={isSelected}>
            <Icon name="chevronright" size={14} />
          </RightArrowContainer>
        )}
      </TreeNodeRoot>
    );
  }),
);

TreeNode.propTypes = propTypes;
