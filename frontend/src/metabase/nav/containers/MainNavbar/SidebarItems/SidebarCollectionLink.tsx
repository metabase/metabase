import cx from "classnames";
import type { KeyboardEvent } from "react";
import { forwardRef, useCallback, useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { getCollectionIcon } from "metabase/common/collections/utils";
import { ForwardRefLink } from "metabase/common/components/Link";
import { CollectionDropTarget } from "metabase/common/components/dnd/CollectionDropTarget";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import CS from "metabase/css/core/index.css";
import { getIsTenantUser } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import { SidebarItemName } from "./SidebarItemName";
import S from "./SidebarItems.module.css";

type DroppableProps = {
  hovered: boolean;
  highlighted: boolean;
};

type Props = DroppableProps &
  Omit<TreeNodeProps, "item"> & {
    nonNavigable?: boolean;
    collection: Collection;
  };

const TIME_BEFORE_EXPANDING_ON_HOVER = 600;

const SidebarCollectionLink = forwardRef<HTMLLIElement, Props>(
  function SidebarCollectionLink(
    {
      collection,
      nonNavigable,
      hovered: isHovered,
      depth,
      onSelect,
      isExpanded,
      isSelected,
      hasChildren,
      onToggleExpand,
      rightSection,
    }: Props,
    ref,
  ) {
    const wasHovered = usePrevious(isHovered);
    const timeoutId = useRef<number>();
    const isTenantUser = useSelector(getIsTenantUser);

    useEffect(() => {
      const justHovered = !wasHovered && isHovered;

      if (justHovered && !isExpanded) {
        timeoutId.current = window.setTimeout(() => {
          if (isHovered) {
            onToggleExpand();
          }
        }, TIME_BEFORE_EXPANDING_ON_HOVER);
      }

      return () => clearTimeout(timeoutId.current);
    }, [wasHovered, isHovered, isExpanded, onToggleExpand]);

    const url = Urls.collection(collection);

    const onKeyDown = useCallback(
      (event: KeyboardEvent) => {
        if (!hasChildren) {
          return;
        }
        switch (event.key) {
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
      },
      [isExpanded, hasChildren, onToggleExpand],
    );

    const icon = getCollectionIcon(collection, { isTenantUser });

    const content = (
      <>
        <TreeNode.IconContainer transparent={false} c="core-brand">
          <Icon {...icon} />
        </TreeNode.IconContainer>
        <SidebarItemName>{collection.name}</SidebarItemName>
        {/* Unjustified type cast. FIXME */}
        {rightSection?.(collection as unknown as ITreeNodeItem)}
      </>
    );

    return (
      <TreeNode.Root
        role="treeitem"
        depth={depth}
        isSelected={isSelected}
        className={cx(S.nodeRoot, {
          [S.selected]: isSelected,
          [S.dropTarget]: isHovered,
        })}
        bdrs="xxs"
        aria-selected={isSelected}
        onClick={isSelected ? onToggleExpand : undefined}
        ref={ref}
      >
        <TreeNode.ExpandToggleButton
          c="core-brand"
          py="xxs"
          pl="xxxs"
          pr={0}
          hidden={!hasChildren}
          onClick={onToggleExpand}
        >
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </TreeNode.ExpandToggleButton>
        {nonNavigable ? (
          <Flex
            className={CS.cursorPointer}
            align="center"
            w="100%"
            miw={0}
            onKeyDown={onKeyDown}
          >
            {content}
          </Flex>
        ) : (
          <Flex
            component={ForwardRefLink}
            className={S.link}
            align="center"
            w="100%"
            miw={0}
            to={url}
            onClick={onSelect}
            onKeyDown={onKeyDown}
          >
            {content}
          </Flex>
        )}
      </TreeNode.Root>
    );
  },
);

export const DroppableSidebarCollectionLink = forwardRef<
  HTMLLIElement,
  TreeNodeProps
>(function DroppableSidebarCollectionLink(
  { item, ...props }: TreeNodeProps,
  ref,
) {
  // Unjustified type cast. FIXME
  const collection = item as unknown as Collection;

  const link = (droppableProps?: DroppableProps) => (
    <SidebarCollectionLink
      {...props}
      hovered={droppableProps?.hovered ?? false}
      highlighted={droppableProps?.highlighted ?? false}
      collection={collection}
      nonNavigable={item.nonNavigable}
      ref={ref}
    />
  );

  return (
    <div data-testid="sidebar-collection-link-root">
      {item.nonNavigable ? (
        link()
      ) : (
        <CollectionDropTarget collection={collection}>
          {(droppableProps: DroppableProps) => link(droppableProps)}
        </CollectionDropTarget>
      )}
    </div>
  );
});
