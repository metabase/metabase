import type { IconName, TreeNodeData } from "metabase/ui";
import type {
  Database,
  DatabaseId,
  SchemaId,
  TableId,
} from "metabase-types/api";

export type TreeNode = TreeNodeData & {
  data: NodeData;
  icon: IconName;
  type: "database" | "schema" | "table";
};

export type NodeData = {
  databaseId: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

export function getTreeData(database: Database[]): TreeNode[] {
  return database.map((database) => {
    const tables = database.tables ?? [];
    const schemas = new Set(tables.map((table) => table.schema));

    const res = getTreeNode({
      type: "database",
      icon: "database",
      label: database.name,
      data: { databaseId: database.id },
      children: Array.from(schemas).map((schema) =>
        getTreeNode({
          type: "schema",
          icon: "schema",
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
                icon: "table2",
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

function getTreeNode(node: Omit<TreeNode, "value">): TreeNode {
  return {
    ...node,
    value: JSON.stringify(node.data),
  };
}
