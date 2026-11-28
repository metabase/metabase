import { useMemo } from "react";

import { skipToken } from "metabase/api";
import { useListTablesQuery } from "metabase/api/table";
import { isSyncCompleted } from "metabase/utils/syncing";

import type { DatabaseNode, SchemaNode, TableNode, TreeNode } from "../types";
import { node, rootNode } from "../utils";

/**
 * Fetch the tables matching `query` and render them as a TreeNode so we can use the same
 * data structure for the tree and the search results and render them in a consistent way.
 * Hidden tables are included, so that admins can find them to unhide them.
 */
export function useSearch(query: string) {
  const { data: tables, isLoading } = useListTablesQuery(
    query === "" ? skipToken : { term: query },
  );

  const tree = useMemo(() => {
    const tree: TreeNode = rootNode();

    tables?.forEach((table) => {
      const { id, db_id: databaseId, db, schema: schemaName } = table;

      let databaseNode = tree.children.find(
        (node) =>
          node.type === "database" && node.value.databaseId === databaseId,
      );
      if (!databaseNode) {
        databaseNode = node<DatabaseNode>({
          type: "database",
          label: db?.name ?? String(databaseId),
          value: { databaseId },
        });
        tree.children.push(databaseNode);
      }

      let schemaNode = databaseNode.children.find(
        (node) =>
          node.type === "schema" && node.value.schemaName === schemaName,
      );
      if (!schemaNode) {
        schemaNode = node<SchemaNode>({
          type: "schema",
          label: schemaName,
          value: { databaseId, schemaName },
        });
        databaseNode.children.push(schemaNode);
      }

      schemaNode.children.push(
        node<TableNode>({
          type: "table",
          label: table.display_name,
          value: { databaseId, schemaName, tableId: id },
          table,
          disabled: !isSyncCompleted(table),
        }),
      );
    });
    return tree;
  }, [tables]);

  return {
    isLoading,
    tree,
  };
}
