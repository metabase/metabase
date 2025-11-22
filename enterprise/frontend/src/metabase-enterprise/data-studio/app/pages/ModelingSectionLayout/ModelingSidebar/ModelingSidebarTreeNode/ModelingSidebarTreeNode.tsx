import { forwardRef } from "react";

import { Tree } from "metabase/common/components/tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import S from "./ModelingSidebarTreeNode.module.css";

export const ModelingSidebarTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function ModelingSidebarTreeNode(props, ref) {
    return (
      <Tree.Node
        {...props}
        ref={ref}
        className={S.treeNode}
        data-selected={props.isSelected}
      />
    );
  },
);
