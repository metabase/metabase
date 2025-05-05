import cx from "classnames";
import { push } from "react-router-redux";

import { useDispatch } from "metabase/lib/redux";
import {
  Group,
  Icon,
  Loader,
  type RenderTreeNodePayload,
  Tree,
  getTreeExpandedState,
  useTree,
} from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

import { getUrl } from "../../utils";

import S from "./TablePicker.module.css";
import { type NodeData, type TreeNode, useTreeData } from "./utils";

export function TablePicker(props: {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
}) {
  const dispatch = useDispatch();
  const { data, isLoading, isError } = useTreeData();

  const tree = useTree({
    multiple: false,
    initialExpandedState: getTreeExpandedState(data, [
      JSON.stringify(props),
      JSON.stringify({ ...props, tableId: undefined }),
      JSON.stringify({ ...props, tableId: undefined, schemaId: undefined }),
    ]),
    onNodeExpand(value) {
      const data = JSON.parse(value) as NodeData;
      dispatch(
        push(
          getUrl({
            databaseId: data.databaseId,
            schemaId: data.schemaId,
            tableId: data.tableId,
            fieldId: undefined,
          }),
        ),
      );
    },
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
      data={data}
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
