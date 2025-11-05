import { useMemo } from "react";

import { skipToken, useSearchQuery } from "metabase/api";
import { isSyncCompleted } from "metabase/lib/syncing";

import type { DatabaseNode, SchemaNode, TableNode, TreeNode } from "../types";
import { node, rootNode } from "../utils";

/**
 * Fetch items from the search API and renders them as a TreeNode so we can use the same
 * data structure for the tree and the search results and render them in a consistent way.
 */
export function useSearch(query: string) {
  const { data, isLoading } = useSearchQuery(
    query === ""
      ? skipToken
      : {
          q: query,
          models: ["table"],
        },
  );

  const tree = useMemo(() => {
    const tree: TreeNode = rootNode();

    data?.data.forEach((result) => {
      const { model, database_name, database_id, table_schema, id, name } =
        result;
      const tableSchema = table_schema ?? "";

      if (model !== "table" || database_name === null) {
        return;
      }

      let databaseNode = tree.children.find(
        (node) =>
          node.type === "database" && node.value.databaseId === database_id,
      );
      if (!databaseNode) {
        databaseNode = node<DatabaseNode>({
          type: "database",
          label: database_name,
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
          label: name,
          value: {
            databaseId: database_id,
            schemaName: tableSchema,
            tableId: id,
          },
          disabled: !isSyncCompleted(result),
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
