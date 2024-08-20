import * as React from "react";
import _ from "underscore";

import { useLocale } from "metabase/common/hooks/use-locale/use-locale";
import { localizeInput } from "metabase/common/utils/i18n";
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
      ...props
    }: TreeNodeProps,
    ref,
  ) {
    const { name, icon } = item;

    const locale = useLocale();

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
        <NameContainer data-testid="tree-item-name">
          {localizeInput(name, locale)}
        </NameContainer>
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
