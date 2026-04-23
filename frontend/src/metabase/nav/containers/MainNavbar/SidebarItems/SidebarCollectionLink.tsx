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
import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getIsTenantUser } from "metabase/selectors/user";
import { useSelector } from "metabase/utils/redux";
import * as Urls from "metabase/utils/urls";
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
    const isRegularCollection = PLUGIN_COLLECTIONS.isRegularCollection(
      collection as unknown as Collection,
    );

    const content = (
      <>
        <TreeNode.IconContainer transparent={false}>
          <SidebarIcon {...icon} isSelected={isSelected} />
        </TreeNode.IconContainer>
        <NameContainer>{collection.name}</NameContainer>
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
  },
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DroppableSidebarCollectionLink;
