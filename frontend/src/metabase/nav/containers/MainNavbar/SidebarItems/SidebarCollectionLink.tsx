/* eslint-disable react/prop-types */
import React, { useCallback, KeyboardEvent } from "react";
import _ from "underscore";

import { Collection } from "metabase-types/api";

import { TreeNode } from "metabase/components/tree/TreeNode";
import { TreeNodeProps } from "metabase/components/tree/types";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import { CollectionIcon } from "metabase/collections/components/CollectionIcon";

import { PLUGIN_COLLECTIONS } from "metabase/plugins";
import { composeEventHandlers } from "metabase/lib/compose-event-handlers";

import { FullWidthLink, NameContainer, NodeRoot } from "./SidebarItems.styled";

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
  const isRegular = PLUGIN_COLLECTIONS.isRegularCollection(
    (collection as unknown) as Collection,
  );

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

  return (
    <div data-testid="sidebar-collection-link-root">
      <CollectionDropTarget collection={collection}>
        {({ hovered }: { hovered: boolean }) => (
          <NodeRoot
            role="treeitem"
            depth={depth}
            isSelected={isSelected}
            hovered={hovered}
            onClick={onToggleExpand}
            ref={ref}
          >
            <TreeNode.ExpandToggleButton hidden={!hasChildren}>
              <TreeNode.ExpandToggleIcon
                isExpanded={isExpanded}
                name="chevronright"
                size={12}
              />
            </TreeNode.ExpandToggleButton>
            <FullWidthLink to={url} onClick={onSelect} onKeyDown={onKeyDown}>
              <TreeNode.IconContainer transparent={isRegular}>
                <CollectionIcon collection={collection} />
              </TreeNode.IconContainer>
              <NameContainer>{name}</NameContainer>
            </FullWidthLink>
          </NodeRoot>
        )}
      </CollectionDropTarget>
    </div>
  );
});

export default SidebarCollectionLink;
