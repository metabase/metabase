import { useCallback, useRef, useState } from "react";
import { useLatest } from "react-use";
import _ from "underscore";

import {
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
} from "metabase/api";
import { isSyncCompleted } from "metabase/lib/syncing";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import { UNNAMED_SCHEMA_NAME } from "../constants";
import type {
  DatabaseNode,
  RootNode,
  SchemaNode,
  TableNode,
  TreePath,
} from "../types";
import { merge, node, rootNode, toKey } from "../utils";

/**
 * Provides a function that fetches for a specific path the database, schema and table (or any subset that applies to the path).
 *
 * This state is managed at the top-level so we can generate a flat list of all nodes in the tree,
 * which makes virtualization possible.
 *
 * This also makes it easier to do state transformations which needs more information than is available
 * locally at any node in the path.
 *
 * This works by fetching the data and then recursively merging the results into the tree of data that was already fetched.
 */
export function useTableLoader() {
  const [fetchDatabases, databases] = useLazyListDatabasesQuery();
  const [fetchSchemas, schemas] = useLazyListDatabaseSchemasQuery();
  const [fetchTables, tables] = useLazyListDatabaseSchemaTablesQuery();
  const databasesRef = useLatest(databases);
  const schemasRef = useLatest(schemas);
  const tablesRef = useLatest(tables);

  const [tree, setTree] = useState<RootNode>(rootNode());
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const getDatabases = useCallback(async () => {
    const response = await fetchDatabases({}, true);
    if (databasesRef.current.isError) {
      // Do not refetch when this call failed previously.
      // This is to prevent infinite data-loading loop as RTK query does not cache error responses.
      return [];
    }

    return (
      response.data?.data.map((database) =>
        node<DatabaseNode>({
          type: "database",
          label: database.name,
          value: { databaseId: database.id },
        }),
      ) ?? []
    );
  }, [fetchDatabases, databasesRef]);

  const getTables = useCallback(
    async (
      databaseId: DatabaseId | undefined,
      schemaName: SchemaName | undefined,
    ) => {
      if (databaseId === undefined || schemaName === undefined) {
        return [];
      }

      const newArgs = {
        id: databaseId,
        schema: schemaName,
        include_hidden: true,
      };

      if (
        tablesRef.current.isError &&
        _.isEqual(tablesRef.current.originalArgs, newArgs)
      ) {
        // Do not refetch when this call failed previously.
        // This is to prevent infinite data-loading loop as RTK query does not cache error responses.
        return [];
      }

      const response = await fetchTables(newArgs, true);

      return (
        response?.data?.map((table) =>
          node<TableNode>({
            type: "table",
            label: table.display_name,
            value: { databaseId, schemaName, tableId: table.id },
            table,
            disabled: !isSyncCompleted(table),
          }),
        ) ?? []
      );
    },
    [fetchTables, tablesRef],
  );

  const getSchemas = useCallback(
    async (databaseId: DatabaseId | undefined) => {
      if (databaseId === undefined) {
        return [];
      }

      const newArgs = {
        id: databaseId,
        include_hidden: true,
      };

      if (
        schemasRef.current.isError &&
        _.isEqual(schemasRef.current.originalArgs, newArgs)
      ) {
        // Do not refetch when this call failed previously.
        // This is to prevent infinite data-loading loop as RTK query does not cache error responses.
        return [];
      }

      const response = await fetchSchemas(newArgs, true);
      return Promise.all(
        response.data?.map(async (schemaName, _, schemas) => {
          const schema = node<SchemaNode>({
            type: "schema",
            label: schemaName,
            value: { databaseId, schemaName },
          });

          // If the schema is unnamed, or if it's the only schema in the database,
          // fetch the tables immediately so we can render a flattened tree.
          if (schemaName === UNNAMED_SCHEMA_NAME || schemas.length === 1) {
            schema.children = await getTables(databaseId, schemaName);
          }
          return schema;
        }) ?? [],
      );
    },
    [fetchSchemas, getTables, schemasRef],
  );

  const pendingPathsRef = useRef(new Set<string>());

  const load = useCallback(
    async function (path: TreePath) {
      const key = toKey({
        databaseId: path.databaseId,
        schemaName: path.schemaName,
        tableId: path.tableId,
      });

      if (pendingPathsRef.current.has(key)) {
        return;
      }

      pendingPathsRef.current.add(key);

      const { databaseId, schemaName } = path;
      const [databases, schemas, tables] = await Promise.all([
        getDatabases(),
        getSchemas(path.databaseId),
        getTables(path.databaseId, path.schemaName),
      ]);

      const newTree = rootNode(
        databases.map((database) => ({
          ...database,
          children:
            database.value.databaseId !== databaseId
              ? database.children
              : schemas.map((schema) => ({
                  ...schema,
                  children:
                    schema.value.schemaName !== schemaName
                      ? schema.children
                      : tables,
                })),
        })),
      );
      try {
        setTree((current) => {
          const merged = merge(current, newTree);
          return _.isEqual(current, merged) ? current : merged;
        });
        setIsInitialLoading(false);
      } finally {
        pendingPathsRef.current.delete(key);
      }
    },
    [getDatabases, getSchemas, getTables],
  );

  return { tree, reload: load, isLoading: isInitialLoading };
}
