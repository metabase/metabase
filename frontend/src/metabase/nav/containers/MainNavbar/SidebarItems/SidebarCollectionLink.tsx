import type { KeyboardEvent } from "react";
import { forwardRef, useCallback, useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { getCollectionIcon } from "metabase/common/collections/utils";
import { CollectionDropTarget } from "metabase/common/components/dnd/CollectionDropTarget";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { getIsTenantUser } from "metabase/current-user";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { IconProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Collection } from "metabase-types/api";

import {
  CollectionNodeRoot,
  ExpandToggleButton,
  FullWidthContainer,
  FullWidthLink,
  NameContainer,
  SidebarIcon,
} from "./SidebarItems.styled";

type DroppableProps = {
  hovered: boolean;
  highlighted: boolean;
};

type Props = DroppableProps &
  Omit<TreeNodeProps, "item"> & {
    nonNavigable?: boolean;
    collection: Collection;
    icon?: IconProps;
  };

const TIME_BEFORE_EXPANDING_ON_HOVER = 600;

const SidebarCollectionLink = forwardRef<HTMLLIElement, Props>(
  function SidebarCollectionLink(
    {
      collection,
      icon,
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

    const nodeIcon = icon ?? getCollectionIcon(collection, { isTenantUser });
    const isRegularCollection =
      PLUGIN_COLLECTIONS.isRegularCollection(collection);

    const content = (
      <>
        <TreeNode.IconContainer transparent={false}>
          <SidebarIcon {...nodeIcon} isSelected={isSelected} />
        </TreeNode.IconContainer>
        <NameContainer>{collection.name}</NameContainer>
        {/* Unjustified type cast. FIXME */}
        {rightSection?.(collection as unknown as ITreeNodeItem)}
      </>
    );

    return (
      <CollectionNodeRoot
        role="treeitem"
        depth={depth}
        aria-selected={isSelected}
        isSelected={isSelected}
        hovered={isHovered}
        onClick={isSelected ? onToggleExpand : undefined}
        hasDefaultIconStyle={isRegularCollection}
        ref={ref}
      >
        <ExpandToggleButton hidden={!hasChildren} onClick={onToggleExpand}>
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </ExpandToggleButton>
        {nonNavigable ? (
          <FullWidthContainer onKeyDown={onKeyDown}>
            {content}
          </FullWidthContainer>
        ) : (
          <FullWidthLink to={url} onClick={onSelect} onKeyDown={onKeyDown}>
            {content}
          </FullWidthLink>
        )}
      </CollectionNodeRoot>
    );
  },
);

const DroppableSidebarCollectionLink = forwardRef<HTMLLIElement, TreeNodeProps>(
  function DroppableSidebarCollectionLink(
    { item, ...props }: TreeNodeProps,
    ref,
  ) {
    // Unjustified type cast. FIXME
    const collection = item as unknown as Collection;
    // A node that stands for no collection, such as the branch a worktree's collections hang under, brings its
    // own icon; a real collection's is worked out from the collection, which a tenant user sees differently.
    const ownIcon = item.nonNavigable
      ? typeof item.icon === "string"
        ? { name: item.icon }
        : item.icon
      : undefined;

    const link = (droppableProps?: DroppableProps) => (
      <SidebarCollectionLink
        {...props}
        hovered={droppableProps?.hovered ?? false}
        highlighted={droppableProps?.highlighted ?? false}
        collection={collection}
        icon={ownIcon}
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
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DroppableSidebarCollectionLink;
