import { useCallback, useEffect, useMemo, useState } from "react";
import { useDeepCompareEffect, useLatest } from "react-use";
import _ from "underscore";

import {
  skipToken,
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
  useListCollectionsTreeQuery,
  useSearchQuery,
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
import type { IconName } from "metabase/ui";
import type {
  CardId,
  DatabaseId,
  SchemaName,
  SearchResult,
  TableId,
} from "metabase-types/api";

import { getUrl as getUrl_ } from "../../utils";

import type {
  CollectionNode,
  DatabaseNode,
  ExpandedState,
  FlatItem,
  ItemType,
  ModelNode,
  NodeKey,
  RootNode,
  SchemaNode,
  TableNode,
  TreeNode,
  TreePath,
} from "./types";

const UNNAMED_SCHEMA_NAME = "";
const CHILD_TYPES: Record<ItemType, ItemType | null> = {
  database: "schema",
  schema: "table",
  table: null,
  collection: "model",
  model: null,
} as const;

export const TYPE_ICONS: Record<ItemType, IconName> = {
  database: "database",
  schema: "folder",
  table: "table2",
  collection: "collection",
  model: "model",
};

export function isItemWithHiddenExpandIcon(item: FlatItem): boolean {
  if (item.type === "model" || item.type === "table") {
    return true;
  }

  return false;
}

export function getUrl(value: TreePath) {
  return getUrl_({
    fieldId: undefined,
    tableId: undefined,
    databaseId: undefined,
    schemaName: undefined,

    modelId: undefined,
    fieldName: undefined,
    collectionId: undefined,
    ...value,
  });
}

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
        ...databases.map((database) => ({
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
          model_ancestors: true,
        },
  );

  const tree = useMemo(() => {
    const tree: TreeNode = rootNode();

    (data?.data as SearchResult<TableId, "table">[]).forEach((result) => {
      const { model, database_name, database_id, table_schema, id, name } =
        result;
      const tableSchema = table_schema ?? "";

      if (model === "table" || database_name != null) {
        let databaseNode = tree.children.find(
          (node) =>
            node.type === "database" && node.value.databaseId === database_id,
        ) as DatabaseNode | undefined;
        if (!databaseNode) {
          databaseNode = node<DatabaseNode>({
            type: "database",
            label: database_name || "",
            value: {
              databaseId: database_id,
            },
          });
          tree.children.push(databaseNode);
        }

        let schemaNode = databaseNode.children.find((node) => {
          return (
            node.type === "schema" && node.value.schemaName === tableSchema
          );
        }) as SchemaNode | undefined;
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
      }
    });
    return tree;
  }, [data]);

  return {
    isLoading,
    tree,
  };
}

/**
 * Returns a state object that indicates which nodes are expanded in the tree.
 */
export function useExpandedState(path: TreePath) {
  const [state, setState] = useState(expandPath({}, path));

  const { databaseId, schemaName, tableId, collectionId, modelId } = path;

  // TODO: we should resolve selected collection parents and expand the whole subtree
  useEffect(() => {
    // When the path changes, this means a user has navigated through the browser back
    // button, ensure the path is completely expanded.
    setState((state) =>
      expandPath(state, {
        databaseId,
        schemaName,
        tableId,
        collectionId,
        modelId,
      }),
    );
  }, [databaseId, schemaName, tableId, collectionId, modelId]);

  const isExpanded = useCallback(
    (path: string | TreePath) => {
      const key = typeof path === "string" ? path : toKey(path);
      return Boolean(state[key]);
    },
    [state],
  );

  const toggle = useCallback((key: string, value?: boolean) => {
    setState((current) => ({
      ...current,
      [key]: value ?? !current[key],
    }));
  }, []);

  return {
    isExpanded,
    toggle,
  };
}

// Returns a new state object with all the nodes along the path expanded.
function expandPath(state: ExpandedState, path: TreePath): ExpandedState {
  return {
    ...state,
    [toKey({
      ...path,
      tableId: undefined,
    })]: true,
    [toKey({
      ...path,
      tableId: undefined,
      schemaName: undefined,
    })]: true,
    [toKey({
      ...path,
      tableId: undefined,
      schemaName: undefined,
      databaseId: undefined,
    })]: true,
  };
}

/**
 * Convert a TreeNode into a flat list of items
 * that can easily be rendered using virtualization.
 *
 * This does other things like removing nameless schemas
 * from the tree and adding loading nodes.
 */
export function flatten(
  node: TreeNode,
  opts: {
    addLoadingNodes?: boolean;
    isExpanded?: (key: string) => boolean;
    isSingleSchema?: boolean;
    level?: number;
    parent?: NodeKey;
    canFlattenSingleSchema?: boolean;
  } = {},
): FlatItem[] {
  const {
    addLoadingNodes,
    isExpanded,
    isSingleSchema,
    canFlattenSingleSchema,
    level = 0,
    parent,
  } = opts;
  if (node.type === "root") {
    // root node doesn't render a title and is always expanded
    if (addLoadingNodes && node.children.length === 0) {
      return [
        loadingItem("database", level),
        loadingItem("database", level),
        loadingItem("collection", level),
        loadingItem("collection", level),
      ];
    }
    return /*sortForRootNode(node.children)*/ node.children.flatMap((child) =>
      flatten(child, opts),
    );
  }

  if (
    node.type === "schema" &&
    (node.label === UNNAMED_SCHEMA_NAME ||
      (isSingleSchema && canFlattenSingleSchema))
  ) {
    // Hide nameless schemas in the tree
    return [
      /*...sort(node.children)*/ ...node.children.flatMap((child) =>
        flatten(child, {
          ...opts,
          level,
          parent,
        }),
      ),
    ];
  }

  if (typeof isExpanded === "function" && !isExpanded(node.key)) {
    return [{ ...node, level, parent } as FlatItem];
  }

  if (addLoadingNodes && node.children.length === 0) {
    const childType = CHILD_TYPES[node.type];
    if (!childType) {
      return [{ ...node, level, parent }];
    }
    return [
      { ...node, isExpanded: true, level, parent },
      loadingItem(childType, level + 1, node),
    ];
  }

  return [
    { ...node, isExpanded: true, level, parent },
    /*...sort(node.children)*/ ...node.children.flatMap((child) =>
      flatten(child, {
        ...opts,
        level: level + 1,
        parent: node.key,
        isSingleSchema: node.type === "database" && node.children.length === 1,
      }),
    ),
  ];
}

/**
 * Merge two TreeNodes together.
 */
function merge(a: TreeNode | undefined, b: TreeNode | undefined): TreeNode {
  if (!a) {
    if (!b) {
      throw new Error("Both a and b are undefined");
    }
    return b;
  }
  if (!b) {
    return a;
  }

  const len = Math.max(a.children.length, b.children.length);
  const children = [];

  for (let index = 0; index < len; index++) {
    const aa = a.children?.[index];
    const bb = b.children?.[index];
    children.push(merge(aa, bb));
  }

  return {
    ...a,
    ...b,
    // @ts-expect-error: we can't type the child node here correctly without checking all the combinations, just assume we are right.
    children,
  };
}

/**
 * Create a unique key for a TreePath
 */
function toKey({
  databaseId,
  schemaName,
  tableId,
  collectionId,
  modelId,
}: TreePath) {
  return JSON.stringify([
    databaseId,
    schemaName,
    tableId,
    collectionId,
    modelId,
  ]);
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

function node<T extends TreeNode>(x: Optional<T, "key" | "children">): T {
  return {
    ...x,
    key: toKey(x.value),
    children: x.children ?? [],
  } as T;
}

function rootNode(
  children: (DatabaseNode | CollectionNode | ModelNode)[] = [],
): RootNode {
  return node<RootNode>({
    type: "root",
    label: "",
    value: {},
    children,
  });
}

function loadingItem(
  type: ItemType,
  level: number,
  parent?: TreeNode,
): FlatItem {
  return {
    type,
    level,
    value: parent?.type === "root" ? undefined : parent?.value,
    parent: parent?.type === "root" ? undefined : parent?.key,
    isLoading: true,
    key: Math.random().toString(),
  };
}
