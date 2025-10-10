import cx from "classnames";

import { ItemsListTreeNode } from "metabase/bench/components/ItemsListSection/ItemsListTreeNode";
import Link from "metabase/common/components/Link/Link";
import type { TreeNodeProps } from "metabase/common/components/tree/types";

import S from "./ModelTreeNode.module.css";

export const ModelTreeNode = (props: TreeNodeProps) => {
  if (props.item.id.toString().startsWith("collection")) {
    return (
      <ItemsListTreeNode
        {...props}
        className={S.modelsTreeItem}
        classNames={{
          iconContainer: S.modelsTreeItemIconContainer,
          expandToggleButton: S.modelsTreeItemExpandContainer,
        }}
      />
    );
  }

  return (
    <Link to={`/bench/metadata/model/${props.item.id}`}>
      <ItemsListTreeNode
        {...props}
        className={cx(
          S.modelsTreeItem,
          props.isSelected && S.modelsTreeItemActive,
        )}
        classNames={{
          iconContainer: S.modelsTreeItemIconContainer,
          expandToggleButton: S.modelsTreeItemExpandContainer,
        }}
      />
    </Link>
  );
};
