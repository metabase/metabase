import { forwardRef } from "react";

import { usePermissionsIsHub } from "metabase/admin/permissions/utils/is-hub";
import { Tree } from "metabase/common/components/tree";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import styles from "./AdminTreeNode.module.css";

/**
 * Switches between admin's purple and the hub's blue via CSS Modules rather
 * than the deprecated emotion styling in `FilterableTree.styled.tsx`. See
 * `is-hub.tsx`.
 */
export const AdminTreeNode = forwardRef<HTMLLIElement, TreeNodeProps>(
  function AdminTreeNode(props, ref) {
    const isHub = usePermissionsIsHub();

    const className = props.isSelected
      ? isHub
        ? styles.hubSelected
        : styles.adminSelected
      : isHub
        ? styles.hubUnselected
        : styles.adminUnselected;

    return <Tree.Node {...props} ref={ref} className={className} />;
  },
);
