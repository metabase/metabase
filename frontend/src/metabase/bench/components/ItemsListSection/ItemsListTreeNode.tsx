import { forwardRef } from "react";
import { isObject } from "underscore";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { Icon } from "metabase/ui";
import { color } from "metabase/ui/utils/colors";

export const ItemsListTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function ItemsListTreeNode(
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
        depth={depth}
        isSelected={isSelected}
        aria-expanded={isExpanded}
        onKeyDown={handleKeyDown}
        ref={ref}
      >
        <TreeNode.ExpandToggleButton hidden={!hasChildren}>
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </TreeNode.ExpandToggleButton>

        {icon && (
          <TreeNode.IconContainer transparent={false}>
            <Icon {...iconProps} />
          </TreeNode.IconContainer>
        )}
        <TreeNode.NameContainer
          data-testid="tree-item-name"
          style={{
            color: isSelected ? color("text-white") : color("text-dark"),
            fontWeight: "normal",
          }}
        >
          {name}
        </TreeNode.NameContainer>
      </TreeNode.Root>
    );
  },
);
