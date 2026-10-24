import { useMemo } from "react";

import {
  skipToken,
  useListDatabasesQuery,
  useListTablesQuery,
} from "metabase/api";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { isSyncCompleted } from "metabase/utils/syncing";

import type { DatabaseNode, SchemaNode, TableNode, TreeNode } from "../types";
import { node, rootNode } from "../utils";

export function useSearch(query: string) {
  const { data: tables, isLoading: isLoadingTables } = useListTablesQuery(
    query === ""
      ? skipToken
      : {
          term: query,
        },
  );
  const { data: databases, isLoading: isLoadingDatabases } =
    useListDatabasesQuery(PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps);

  const tree = useMemo(() => {
    const tree: TreeNode = rootNode();
    const allowedDatabaseIds = new Set(
      databases?.data.map((database) => database.id),
    );

    tables?.forEach((table) => {
      const { db_id: database_id, id, display_name } = table;
      if (!allowedDatabaseIds.has(database_id)) {
        return;
      }
      const tableSchema = table.schema ?? "";

      let databaseNode = tree.children.find(
        (node) =>
          node.type === "database" && node.value.databaseId === database_id,
      );
      if (!databaseNode) {
        databaseNode = node<DatabaseNode>({
          type: "database",
          label: table.db?.name ?? String(database_id),
          value: {
            databaseId: database_id,
          },
        });
        tree.children.push(databaseNode);
      }

      let schemaNode = databaseNode.children.find((node) => {
        return node.type === "schema" && node.value.schemaName === tableSchema;
      });
      if (!schemaNode) {
        schemaNode = node<SchemaNode>({
          type: "schema",
          label: tableSchema,
          value: {
            databaseId: database_id,
            schemaName: tableSchema,
          },
        });
        databaseNode.children.push(schemaNode);
      }

      let tableNode = schemaNode.children.find(
        (node) => node.type === "table" && node.value.tableId === id,
      );
      if (!tableNode) {
        tableNode = node<TableNode>({
          type: "table",
          label: display_name || table.name,
          value: {
            databaseId: database_id,
            schemaName: tableSchema,
            tableId: id,
          },
          table,
          disabled: !isSyncCompleted(table),
        });
        schemaNode.children.push(tableNode);
      }
    });
    return tree;
  }, [databases, tables]);

  return {
    isLoading: isLoadingTables || isLoadingDatabases,
    tree,
  };
}
