import cx from "classnames";
import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import {
  Group,
  Icon,
  Loader,
  type RenderTreeNodePayload,
  Tree,
  useTree,
} from "metabase/ui";

import S from "./TablePicker.module.css";
import { type TreeNode, getTreeData } from "./utils";

export function TablePicker() {
  const { isLoading, isError, data } = useListDatabasesQuery({
    include: "tables",
  });

  const treeData = useMemo(() => getTreeData(data?.data ?? []), [data]);
  const tree = useTree({
    multiple: false,
  });

  if (isLoading) {
    // TODO: render skeleton
    return <Loader />;
  }

  if (isError) {
    // TODO: render proper error
    return "ERROR";
  }

  return (
    <Tree
      tree={tree}
      data={treeData}
      levelOffset="md"
      allowRangeSelection={false}
      renderNode={renderNode}
    />
  );
}

function renderNode({ node, expanded, elementProps }: RenderTreeNodePayload) {
  const { icon, label } = node as TreeNode;

  const childCount = node.children?.length ?? 0;
  const hasChildren = childCount > 0;

  return (
    <Group
      {...elementProps}
      gap="sm"
      my="md"
      className={cx(elementProps.className, S.node)}
    >
      {hasChildren && (
        <Icon
          name="chevronright"
          size={10}
          className={cx(S.chevron, { [S.expanded]: expanded })}
          color="var(--mb-color-text-light)"
        />
      )}
      <Icon name={icon} color="var(--mb-color-text-placeholder)" />
      {label}
    </Group>
  );
}
