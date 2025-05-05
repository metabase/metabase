import { useMemo } from "react";

import { useListDatabasesQuery } from "metabase/api";
import type { IconName, TreeNodeData } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

export type TreeNode = TreeNodeData & {
  type: "database" | "schema" | "table";
  loading?: boolean;
  width?: string;
};

export type NodeData = {
  databaseId: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

export function useTreeData() {
  const {
    isLoading,
    isError,
    data: queryData,
  } = useListDatabasesQuery({
    include: "tables",
  });

  const data = useMemo(() => {
    if (isLoading) {
      return [
        getLoadingNode({ type: "database", width: "50%" }),
        getLoadingNode({ type: "database", width: "70%" }),
        getLoadingNode({ type: "database", width: "35%" }),
      ];
    }

    return getTreeData(queryData?.data ?? []);
  }, [queryData, isLoading]);

  return { data, isError };
}

function getTreeData(database: Database[]): TreeNode[] {
  return database.map((database) => {
    const tables = database.tables ?? [];
    const schemas = new Set(tables.map((table) => table.schema));

    const res = getTreeNode({
      type: "database",
      label: database.name,
      data: { databaseId: database.id },
      children: Array.from(schemas).map((schema) =>
        getTreeNode({
          type: "schema",
          label: schema,
          data: {
            databaseId: database.id,
            schemaId: schema,
          },
          children: tables
            .filter((table) => table.schema === schema)
            .map((table) =>
              getTreeNode({
                type: "table",
                label: table.name,
                data: {
                  databaseId: database.id,
                  schemaId: schema,
                  tableId: table.id,
                },
              }),
            ),
        }),
      ),
    });

    if (res.children?.length === 1) {
      // There is only one schema, so lift the tables to the top-level
      // Lift the tables from the only schema to the top-level
      res.children = res.children[0].children ?? [];
    }

    return res;
  });
}

function getTreeNode(
  node: Omit<TreeNode, "value"> & { data: NodeData },
): TreeNode {
  return {
    ...node,
    value: JSON.stringify(node.data),
  };
}

export function getIconForType(
  type: "database" | "schema" | "table",
): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

function getLoadingNode({
  type,
  width,
}: {
  type: "database" | "schema" | "table";
  width: string;
}): TreeNode {
  return {
    type,
    width,
    loading: true,
    value: `loading-type-${Math.random()}`,
    label: "",
  };
}
