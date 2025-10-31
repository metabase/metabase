import { forwardRef } from "react";

import { TreeNode } from "metabase/common/components/tree/TreeNode";
import type { TreeNodeProps } from "metabase/common/components/tree/types";
import { Box } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { SidebarListItemContent } from "../TransformsSidebarLayout/SidebarListItem/SidebarListItem";

import S from "./TransformsTreeNode.module.css";

export const TransformsTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function TransformsTreeNode(props, ref) {
    const transform = props.item.data as Transform | undefined;

    if (!transform) {
      return <TreeNode {...props} ref={ref} />;
    }

    return (
      <TreeNode.Root
        role="menuitem"
        aria-label={props.item.name}
        tabIndex={0}
        onClick={() => props.onSelect?.()}
        depth={props.depth}
        isSelected={props.isSelected}
        ref={ref}
        className={S.treeNodeRoot}
      >
        <TreeNode.ExpandToggleButton hidden />
        <Box className={S.contentBox}>
          <SidebarListItemContent
            label={transform.name}
            icon="table2"
            subtitle={transform.target.name}
            isActive={props.isSelected}
          />
        </Box>
      </TreeNode.Root>
    );
  },
);
