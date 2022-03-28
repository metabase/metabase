/* eslint-disable react/prop-types */
import React, { useCallback, KeyboardEvent } from "react";
import _ from "underscore";

import { TreeNode } from "metabase/components/tree/TreeNode";
import { TreeNodeProps } from "metabase/components/tree/types";

import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import { CollectionIcon } from "metabase/collections/components/CollectionIcon";

import { FullWidthLink, NodeRoot } from "./SidebarItems.styled";

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

  return (
    <div>
      <CollectionDropTarget collection={collection}>
        {({ hovered }: { hovered: boolean }) => (
          <NodeRoot
            role="treeitem"
            depth={depth}
            isSelected={isSelected}
            hovered={hovered}
            onClick={!isExpanded && hasChildren ? onToggleExpand : undefined}
            ref={ref}
          >
            <TreeNode.ExpandToggleButton
              onClick={onToggleExpand}
              hidden={!hasChildren}
            >
              <TreeNode.ExpandToggleIcon
                isExpanded={isExpanded}
                name="chevronright"
                size={12}
              />
            </TreeNode.ExpandToggleButton>
            <FullWidthLink to={url} onKeyDown={onKeyDown}>
              <TreeNode.IconContainer>
                <CollectionIcon collection={collection} />
              </TreeNode.IconContainer>
              <TreeNode.NameContainer>{name}</TreeNode.NameContainer>
            </FullWidthLink>
          </NodeRoot>
        )}
      </CollectionDropTarget>
    </div>
  );
});

export default SidebarCollectionLink;
