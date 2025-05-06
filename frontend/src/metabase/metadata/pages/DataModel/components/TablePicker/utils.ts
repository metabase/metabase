import { useEffect, useState } from "react";

import {
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
} from "metabase/api";
import type { IconName, TreeNodeData } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

type NodeType = "database" | "schema" | "table";

export type TreeNode = TreeNodeData & {
  type: NodeType;
  loading?: boolean;
  width?: string;
  children?: TreeNode[];
};

export type NodeData = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

async function delay<T>(promise: Promise<T>) {
  await new Promise((resolve) => setTimeout(resolve, 100));
  return promise;
}

export function useTreeData({ databaseId, schemaId }: NodeData) {
  const [data, setData] = useState<TreeNode[] | undefined>(undefined);

  const [fetchDatabases, databasesResult] = useLazyListDatabasesQuery();
  const [fetchSchemas, schemasResult] = useLazyListDatabaseSchemasQuery();
  const [fetchTables, tablesResult] = useLazyListDatabaseSchemaTablesQuery();

  useEffect(() => {
    (async function () {
      const [databases, schemas, tables] = await Promise.all([
        delay(fetchDatabases()),
        databaseId ? delay(fetchSchemas({ id: databaseId })) : null,
        databaseId && schemaId
          ? delay(fetchTables({ id: databaseId, schema: schemaId }))
          : null,
      ]);

      const tree: TreeNode[] | undefined = databases.data?.data.map(
        (database) => ({
          type: "database",
          label: database.name,
          value: JSON.stringify({ databaseId: database.id }),
          children:
            database.id === databaseId
              ? schemas?.data?.map((schemaId_) => ({
                  type: "schema",
                  label: schemaId_,
                  value: JSON.stringify({
                    databaseId: database.id,
                    schemaId: schemaId_,
                  }),
                  children:
                    schemaId === schemaId_
                      ? tables?.data?.map((table) => ({
                          type: "table",
                          label: table.name,
                          value: JSON.stringify({
                            databaseId: database.id,
                            schemaId: schemaId_,
                            tableId: table.id,
                          }),
                        }))
                      : undefined,
                }))
              : undefined,
        }),
      );

      setData((prev) => merge(prev, tree));
    })();
  }, [databaseId, schemaId, fetchTables, fetchSchemas, fetchDatabases]);

  const isError =
    databasesResult.isError || schemasResult.isError || tablesResult.isError;

  return {
    isError,
    data: liftSingleSchemaTables(addLoadingStates(data)),
  };
}

function merge(
  a: TreeNode[] | undefined,
  b: TreeNode[] | undefined,
): TreeNode[] | undefined {
  if (a === undefined) {
    return b;
  }
  if (b === undefined) {
    return a;
  }

  const len = Math.max(a.length, b.length);
  const res = [];
  for (let index = 0; index < len; index++) {
    const aa = a[index];
    const bb = b[index];

    res.push({
      ...aa,
      ...bb,
      children: merge(aa?.children, bb?.children),
    });
  }
  return res;
}

function addLoadingStates(
  tree: TreeNode[] | undefined,
  type: NodeType | null = "database",
): TreeNode[] {
  if (type == null) {
    return tree ?? [];
  }

  if (tree === undefined) {
    return getLoadingNodes(type);
  }

  return tree.map((node) => ({
    ...node,
    children: addLoadingStates(node.children, childType(node.type)),
  }));
}

function liftSingleSchemaTables(tree: TreeNode[]): TreeNode[] {
  return tree?.map(function (node) {
    if (
      node.type !== "database" ||
      node.children?.length !== 1 ||
      node.children?.[0].type !== "schema" ||
      !node.children?.[0]?.children?.every(
        (child: TreeNode) => child.type !== "table",
      )
    ) {
      return node;
    }

    return {
      ...node,
      children: node.children?.[0].children,
    };
  });
}

export function getIconForType(
  type: "database" | "schema" | "table",
): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

function childType(type: NodeType): NodeType | null {
  switch (type) {
    case "database":
      return "schema";
    case "schema":
      return "table";
    default:
      return null;
  }
}

function getLoadingNodes(type: NodeType): TreeNode[] {
  return [
    getLoadingNode({ type, width: "30%" }),
    getLoadingNode({ type, width: "80%" }),
    getLoadingNode({ type, width: "60%" }),
  ];
}

function getLoadingNode({
  type,
  width,
}: {
  type: NodeType;
  width: string;
}): TreeNode {
  return {
    type,
    label: "",
    loading: true,
    value: `loading-type-${Math.random()}`,
    width,
  };
}
