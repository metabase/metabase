import { useCallback, useMemo, useState } from "react";
import { useDeepCompareEffect, useLatest } from "react-use";
import _ from "underscore";

import {
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
  useListCollectionsTreeQuery,
} from "metabase/api";
import { getGroupedTreeItems } from "metabase/bench/components/models/utils";
import { useFetchModels } from "metabase/common/hooks/use-fetch-models";
// eslint-disable-next-line no-restricted-imports
import {
  type CollectionTreeItem,
  buildCollectionTree,
  getCollectionIcon,
} from "metabase/entities/collections";
import { useSelector } from "metabase/lib/redux";
import { isSyncCompleted } from "metabase/lib/syncing";
import { getUser } from "metabase/selectors/user";
import type {
  CardId,
  DatabaseId,
  SchemaName,
  SearchResult,
} from "metabase-types/api";

import { LEAF_ITEM_ICON_COLOR, UNNAMED_SCHEMA_NAME } from "../constants";
import type {
  CollectionNode,
  DatabaseNode,
  ModelNode,
  SchemaNode,
  TableNode,
  TreeNode,
  TreePath,
} from "../types";
import { merge, node, rootNode, sort } from "../utils";

/**
 * For the currently view path, fetches the database, schema and table (or any subset that applies to the path).
 *
 * This state is managed at the top-level so we can generate a flat list of all nodes in the tree,
 * which makes virtualization possible.
 *
 * This also makes it easier to do state transformations which needs more information than is available
 * locally at any node in the path.
 *
 * This works by fetching the data and then recursively merging the results into the tree of data that was already fetched.
 */
export function useTableLoader(path: TreePath) {
  const [fetchDatabases, databases] = useLazyListDatabasesQuery();
  const [fetchSchemas, schemas] = useLazyListDatabaseSchemasQuery();
  const [fetchTables, tables] = useLazyListDatabaseSchemaTablesQuery();

  const { data: modelsData } = useFetchModels({
    filter_items_in_personal_collection: undefined, // include all models
  });
  const { data: collections } = useListCollectionsTreeQuery({
    "exclude-archived": true,
  });

  const currentUser = useSelector(getUser);

  const databasesRef = useLatest(databases);
  const schemasRef = useLatest(schemas);
  const tablesRef = useLatest(tables);

  const [tree, setTree] = useState<TreeNode>(rootNode());

  const getDatabases = useCallback(async (): Promise<DatabaseNode[]> => {
    const response = await fetchDatabases(
      { include_editable_data_model: true },
      true,
    );

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
        include_editable_data_model: true,
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
            icon: { name: "table2", color: LEAF_ITEM_ICON_COLOR },
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
        include_editable_data_model: true,
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

  const collectionsSubTree = useMemo((): (CollectionNode | ModelNode)[] => {
    const rootCollectionId = "root";

    if (!collections || !modelsData?.data || !currentUser) {
      return [];
    }

    const preparedCollections = getGroupedTreeItems(
      collections,
      currentUser.id,
    );

    const collectionTree = buildCollectionTree(
      preparedCollections,
      (m) => m === "dataset",
    );

    const sortedModels = [...modelsData.data].sort((a, b) =>
      a.name.localeCompare(b.name),
    ) as SearchResult<CardId, "dataset">[];

    function collectionToTreeNode(
      collection: CollectionTreeItem,
    ): CollectionNode {
      const modelsInCollection = sortedModels.filter(
        (model) => model.collection.id === collection.id,
      );

      const modelNodes = modelsInCollection.map(
        (model): ModelNode =>
          node<ModelNode>({
            type: "model",
            label: model.name,
            value: {
              collectionId: collection.id,
              modelId: model.id,
            },
            icon: { name: "model", color: LEAF_ITEM_ICON_COLOR },
          }),
      );

      const childCollectionNodes =
        collection.children.map(collectionToTreeNode);

      return node<CollectionNode>({
        type: "collection",
        label: collection.name,
        icon: getCollectionIcon(collection),
        value: { collectionId: collection.id },
        children: [...childCollectionNodes, ...modelNodes],
      });
    }

    return [
      ...collectionTree
        .filter(({ type }) => type !== "instance-analytics") // ignore Usage Analytics collection as we cannot edit its items metadata
        .map(collectionToTreeNode),
      ...sortedModels
        .filter((m) => !m.collection.id)
        .map((model) =>
          node<ModelNode>({
            type: "model",
            label: model.name,
            value: {
              collectionId: rootCollectionId,
              modelId: model.id,
            },
            icon: { name: "model", color: LEAF_ITEM_ICON_COLOR },
          }),
        ),
    ];
  }, [collections, currentUser, modelsData?.data]);

  const load = useCallback(
    async function (path: TreePath) {
      const { databaseId, schemaName } = path;
      const [databases, schemas, tables] = await Promise.all([
        getDatabases(),
        getSchemas(databaseId),
        getTables(databaseId, schemaName),
      ]);

      const newTree = rootNode([
        ...sort<DatabaseNode>(databases).map((database) => ({
          ...database,
          children:
            database.value.databaseId !== databaseId
              ? database.children
              : sort<SchemaNode>(schemas).map((schema) => ({
                  ...schema,
                  children:
                    schema.value.schemaName !== schemaName
                      ? schema.children
                      : sort<TableNode>(tables),
                })),
        })),
        ...collectionsSubTree,
      ]);

      setTree((current) => {
        const merged = merge(current, newTree);
        return _.isEqual(current, merged) ? current : merged;
      });
    },
    [collectionsSubTree, getDatabases, getSchemas, getTables],
  );

  useDeepCompareEffect(() => {
    load(path);
  }, [
    load,
    path,
    // When a table is modified, e.g. we change display_name with PUT /api/table/:id
    // we need to manually call the lazy RTK hooks, so that the updated table
    // is refetched here. We detect this modification with tables.isFetching.
    tables.isFetching,
  ]);

  return { tree, reload: load };
}
