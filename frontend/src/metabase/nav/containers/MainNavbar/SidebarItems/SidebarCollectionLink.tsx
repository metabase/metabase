import type { KeyboardEvent } from "react";
import { forwardRef, useCallback, useEffect, useRef } from "react";
import { usePrevious } from "react-use";

import { CollectionDropTarget } from "metabase/common/components/dnd/CollectionDropTarget";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type {
  ITreeNodeItem,
  TreeNodeProps,
} from "metabase/common/components/tree/types";
import { getCollectionIcon } from "metabase/entities/collections/utils";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getIsTenantUser } from "metabase/selectors/user";
import type { Collection } from "metabase-types/api";

import {
  CollectionNodeRoot,
  ExpandToggleButton,
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
    collection: Collection;
  };

const TIME_BEFORE_EXPANDING_ON_HOVER = 600;

const SidebarCollectionLink = forwardRef<HTMLLIElement, Props>(
  function SidebarCollectionLink(
    {
      collection,
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
            !isExpanded && onToggleExpand();
            break;
          case "ArrowLeft":
            isExpanded && onToggleExpand();
            break;
        }
      },
      [isExpanded, hasChildren, onToggleExpand],
    );

    const icon = getCollectionIcon(collection, { isTenantUser });
    const isRegularCollection = PLUGIN_COLLECTIONS.isRegularCollection(
      collection as unknown as Collection,
    );

    return (
      <CollectionNodeRoot
        role="treeitem"
        depth={depth}
        aria-selected={isSelected}
        isSelected={isSelected}
        hovered={isHovered}
        onClick={onToggleExpand}
        hasDefaultIconStyle={isRegularCollection}
        ref={ref}
      >
        <ExpandToggleButton hidden={!hasChildren}>
          <TreeNode.ExpandToggleIcon
            isExpanded={isExpanded}
            name="chevronright"
            size={12}
          />
        </ExpandToggleButton>
        <FullWidthLink to={url} onClick={onSelect} onKeyDown={onKeyDown}>
          <TreeNode.IconContainer transparent={false}>
            <SidebarIcon {...icon} isSelected={isSelected} />
          </TreeNode.IconContainer>
          <NameContainer>{collection.name}</NameContainer>
          {rightSection?.(collection as unknown as ITreeNodeItem)}
        </FullWidthLink>
      </CollectionNodeRoot>
    );
  },
);

const DroppableSidebarCollectionLink = forwardRef<HTMLLIElement, TreeNodeProps>(
  function DroppableSidebarCollectionLink(
    { item, ...props }: TreeNodeProps,
    ref,
  ) {
    const collection = item as unknown as Collection;
    return (
      <div data-testid="sidebar-collection-link-root">
        <CollectionDropTarget collection={collection}>
          {(droppableProps: DroppableProps) => (
            <SidebarCollectionLink
              {...props}
              {...droppableProps}
              collection={collection}
              ref={ref}
            />
          )}
        </CollectionDropTarget>
      </div>
    );
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DroppableSidebarCollectionLink;
