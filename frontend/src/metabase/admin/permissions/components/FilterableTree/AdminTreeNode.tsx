import { forwardRef } from "react";

import { usePermissionsIsEmbeddingHub } from "metabase/admin/permissions/utils/is-embedding-hub";
import { Tree } from "metabase/common/components/tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import styles from "./AdminTreeNode.module.css";

/**
 * Switches between admin's purple and the hub's blue. See `is-embedding-hub.tsx`.
 */
export const AdminTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function AdminTreeNode(props, ref) {
    const isEmbeddingHub = usePermissionsIsEmbeddingHub();
    const className = getTreeNodeClassName(isEmbeddingHub, props.isSelected);

    return <Tree.Node {...props} ref={ref} className={className} />;
  },
);

function getTreeNodeClassName(isEmbeddingHub: boolean, isSelected: boolean) {
  if (isEmbeddingHub) {
    return isSelected ? styles.hubSelected : styles.hubUnselected;
  }

  return isSelected ? styles.adminSelected : styles.adminUnselected;
}
