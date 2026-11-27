import { useMemo } from "react";

import { skipToken, useListTablesQuery } from "metabase/api";
import { isSyncCompleted } from "metabase/utils/syncing";

import type { DatabaseNode, SchemaNode, TableNode, TreeNode } from "../types";
import { node, rootNode } from "../utils";

/**
 * Fetch tables matching the query, hidden ones included, and renders them as a TreeNode so we can use the same
 * data structure for the tree and the search results and render them in a consistent way.
 */
export function useSearch(query: string) {
  const { data, isLoading } = useListTablesQuery(
    query === "" ? skipToken : { term: query },
  );

  const tree = useMemo(() => {
    const tree: TreeNode = rootNode();

    data?.forEach((table) => {
      const { db, db_id: database_id, schema, id, display_name } = table;
      const tableSchema = schema ?? "";

      if (db == null || typeof id !== "number") {
        return;
      }

      let databaseNode = tree.children.find(
        (node) =>
          node.type === "database" && node.value.databaseId === database_id,
      );
      if (!databaseNode) {
        databaseNode = node<DatabaseNode>({
          type: "database",
          label: db.name,
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
          label: display_name,
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
  }, [data]);

  return {
    isLoading,
    tree,
  };
}
