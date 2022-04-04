/* eslint-disable react/prop-types */
import React, { useCallback, KeyboardEvent } from "react";
import _ from "underscore";

import { Collection } from "metabase-types/api";

import { TreeNode } from "metabase/components/tree/TreeNode";
import { TreeNodeProps } from "metabase/components/tree/types";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { getCollectionIcon } from "metabase/entities/collections";

import {
  CollectionNodeRoot,
  ExpandToggleButton,
  FullWidthLink,
  NameContainer,
  SidebarIcon,
} from "./SidebarItems.styled";

interface SidebarItemLinkProps extends TreeNodeProps {
  url: string;
}

// eslint-disable-next-line react/display-name
const SidebarCollectionLink = React.forwardRef<
  HTMLLIElement,
  SidebarItemLinkProps
>(function SidebarCollectionLink(
  {
    item: collection,
    url,
    depth,
    onSelect,
    isExpanded,
    isSelected,
    hasChildren,
    onToggleExpand,
  },
  ref,
) {
  const { name } = collection;

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

  const icon = getCollectionIcon(collection);
  const isRegularCollection = PLUGIN_COLLECTIONS.isRegularCollection(
    (collection as unknown) as Collection,
  );

  return (
    <div data-testid="sidebar-collection-link-root">
      <CollectionDropTarget collection={collection}>
        {({ hovered }: { hovered: boolean }) => (
          <CollectionNodeRoot
            role="treeitem"
            depth={depth}
            isSelected={isSelected}
            hovered={hovered}
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
              <NameContainer>{name}</NameContainer>
            </FullWidthLink>
          </CollectionNodeRoot>
        )}
      </CollectionDropTarget>
    </div>
  );
});

export default SidebarCollectionLink;
