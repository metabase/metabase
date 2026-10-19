import cx from "classnames";
import * as React from "react";
import type { CSSProperties } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import {
  Box,
  type BoxProps,
  type ElementProps,
  Flex,
  type FlexProps,
  Icon,
  type IconProps,
} from "metabase/ui";

import S from "./TreeNode.module.css";
import type { TreeNodeProps } from "./types";

type TreeNodeCssVariables = CSSProperties & {
  "--tree-depth": number;
};

type TreeNodeRootProps = FlexProps & {
  isSelected: boolean;
  depth: number;
};

const TreeNodeRoot = React.forwardRef<HTMLLIElement, TreeNodeRootProps>(
  function TreeNodeRoot(
    { isSelected, depth, className, style, ...props },
    ref,
  ) {
    const vars: TreeNodeCssVariables = { "--tree-depth": depth };

    return (
      <Flex
        component="li"
        ref={ref}
        className={cx(
          S.root,
          { [S.selected]: isSelected },
          CS.cursorPointer,
          className,
        )}
        style={style ? [vars, style] : vars}
        align="center"
        pr="sm"
        fw={700}
        {...props}
      />
    );
  },
);

type ExpandToggleButtonProps = BoxProps & ElementProps<"button">;

function ExpandToggleButton({ className, ...props }: ExpandToggleButtonProps) {
  return (
    <Box
      component="button"
      className={cx(S.expandToggle, CS.cursorPointer, className)}
      display="block"
      {...props}
    />
  );
}

interface ExpandToggleIconProps extends IconProps {
  isExpanded: boolean;
}

function ExpandToggleIcon({
  isExpanded,
  className,
  ...props
}: ExpandToggleIconProps) {
  return (
    <Icon
      className={cx(S.expandIcon, { [S.expanded]: isExpanded }, className)}
      {...props}
    />
  );
}

type NameContainerProps = BoxProps & ElementProps<"div">;

// The sidebar wraps it in a Tooltip, which needs the ref
const NameContainer = React.forwardRef<HTMLDivElement, NameContainerProps>(
  function NameContainer({ className, ...props }, ref) {
    return (
      <Box
        ref={ref}
        className={cx(S.name, className)}
        flex={1}
        py="sm"
        pr="sm"
        pl="xxs"
        {...props}
      />
    );
  },
);

type IconContainerProps = FlexProps & {
  transparent?: boolean;
};

function IconContainer({ transparent = true, ...props }: IconContainerProps) {
  return (
    <Flex align="center" p="xxs" opacity={transparent ? 0.5 : 1} {...props} />
  );
}

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
