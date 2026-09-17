import { forwardRef } from "react";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import SidebarCollectionLink from "../SidebarItems/SidebarCollectionLink";
import {
  CollectionNodeRoot,
  ExpandToggleButton,
  FullWidthLink,
  NameContainer,
  SidebarIcon,
} from "../SidebarItems/SidebarItems.styled";

import type { OfficialNavItem } from "./use-official-nav-items";

export type OfficialNavNodeData = {
  navItem?: OfficialNavItem;
};

/**
 * One `TreeNode` implementation serving both collection rows and item rows, so a single `Tree`
 * renders the whole Official subtree. Collection rows delegate to `SidebarCollectionLink` and so
 * keep their drop target, hover-to-expand and remote-sync badge.
 */
export const OfficialNavTreeNode = forwardRef<
  HTMLLIElement,
  TreeNodeProps<OfficialNavNodeData>
>(function OfficialNavTreeNode(props, ref) {
  const navItem = props.item.data?.navItem;

  if (!navItem) {
    // Unjustified type cast. FIXME: SidebarCollectionLink is typed against untyped tree data.
    return <SidebarCollectionLink {...(props as TreeNodeProps)} ref={ref} />;
  }

  const { depth, isSelected, onSelect } = props;
  const hasIconUrl = "iconUrl" in navItem.icon && navItem.icon.iconUrl;

  return (
    <CollectionNodeRoot
      role="treeitem"
      depth={depth}
      aria-selected={isSelected}
      isSelected={isSelected}
      hasDefaultIconStyle
      ref={ref}
    >
      {/* Indent spacer: item rows never expand, but must line up with collection rows. */}
      <ExpandToggleButton hidden />
      <FullWidthLink to={navItem.url} onClick={onSelect}>
        <TreeNode.IconContainer transparent={false}>
          {hasIconUrl ? (
            <EntityIcon
              name={navItem.icon.name}
              iconUrl={navItem.icon.iconUrl}
              size="1rem"
              color="core-brand"
            />
          ) : (
            <SidebarIcon {...navItem.icon} isSelected={isSelected} />
          )}
        </TreeNode.IconContainer>
        <NameContainer>{navItem.name}</NameContainer>
      </FullWidthLink>
    </CollectionNodeRoot>
  );
});
