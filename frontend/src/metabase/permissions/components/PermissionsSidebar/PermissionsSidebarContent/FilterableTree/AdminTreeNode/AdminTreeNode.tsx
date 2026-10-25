import { forwardRef } from "react";

import { Tree } from "metabase/common/components/tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import { isEmbeddingHubPermissions } from "../../../../../utils/embedding";

import styles from "./AdminTreeNode.module.css";

export const AdminTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function AdminTreeNode(props, ref) {
    const className = getTreeNodeClassName(
      isEmbeddingHubPermissions(),
      props.isSelected,
    );

    return <Tree.Node {...props} ref={ref} className={className} />;
  },
);

function getTreeNodeClassName(isEmbeddingHub: boolean, isSelected: boolean) {
  if (isEmbeddingHub) {
    return isSelected ? styles.hubSelected : styles.hubUnselected;
  }

  return isSelected ? styles.adminSelected : styles.adminUnselected;
}
