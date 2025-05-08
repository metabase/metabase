import { useCallback, useEffect, useState } from "react";

import {
  skipToken,
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
  useSearchQuery,
} from "metabase/api";
import type { IconName } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

type NodeType = "database" | "schema" | "table";

export function getIconForType(type: NodeType): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

export function hasChildren(type: NodeType): boolean {
  return type !== "table";
}

export type TreePath = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

type RootNode = {
  type: "root";
  label: "";
  children: TreeNode[];
};

export type TreeNode = RootNode | (Item & { children: TreeNode[] });

type DatabaseItem = {
  type: "database";
  label: string;
  key: string;
  value: { databaseId: DatabaseId };
};

type SchemaItem = {
  type: "schema";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId };
};

type TableItem = {
  type: "table";
  label: string;
  key: string;
  value: { databaseId: DatabaseId; schemaId: SchemaId; tableId: TableId };
};

export type Item = DatabaseItem | SchemaItem | TableItem;

export function useTableLoader(path: TreePath) {
  const [fetchDatabases] = useLazyListDatabasesQuery();
  const [fetchSchemas] = useLazyListDatabaseSchemasQuery();
  const [fetchTables] = useLazyListDatabaseSchemaTablesQuery();

  const [tree, setTree] = useState<TreeNode>({
    type: "root",
    label: "",
    children: [],
  });

  const getDatabases = useCallback(async () => {
    const res = await fetchDatabases({}, true);
    return (
      res.data?.data.map((database) =>
        item<DatabaseItem>({
          type: "database",
          label: database.name,
          value: { databaseId: database.id },
        }),
      ) ?? []
    );
  }, [fetchDatabases]);

  const getSchemas = useCallback(
    async (databaseId: DatabaseId | undefined) => {
      if (databaseId === undefined) {
        return [];
      }
      const res = await fetchSchemas({ id: databaseId }, true);
      return (
        res.data?.map((schema) =>
          item<SchemaItem>({
            type: "schema",
            label: schema,
            value: { databaseId, schemaId: schema },
          }),
        ) ?? []
      );
    },
    [fetchSchemas],
  );

  const getTables = useCallback(
    async (
      databaseId: DatabaseId | undefined,
      schemaId_: SchemaId | undefined,
    ) => {
      const schemaId = schemaId_?.replace(/^\d+:/, "");
      if (databaseId === undefined || schemaId === undefined) {
        return [];
      }
      const res = await fetchTables({ id: databaseId, schema: schemaId }, true);
      return (
        res?.data?.map((table) =>
          item<TableItem>({
            type: "table",
            label: table.name,
            value: { databaseId, schemaId, tableId: table.id },
          }),
        ) ?? []
      );
    },
    [fetchTables],
  );

  const load = useCallback(
    async function (path: TreePath) {
      const { databaseId, schemaId } = path;
      const [databases, schemas, tables] = await Promise.all([
        getDatabases(),
        getSchemas(path.databaseId),
        getTables(path.databaseId, path.schemaId),
      ]);

      const newTree: TreeNode = {
        type: "root",
        label: "",
        children: databases.map((database) => ({
          ...database,
          children:
            database.value.databaseId !== databaseId
              ? []
              : schemas.map((schema) => ({
                  ...schema,
                  children:
                    schema.value.schemaId !== schemaId
                      ? []
                      : tables.map((table) => ({
                          ...table,
                          children: [],
                        })),
                })),
        })),
      };
      setTree((current) => merge(current, newTree));
    },
    [getDatabases, getSchemas, getTables],
  );

  useEffect(() => {
    load(path);
  }, [path, load]);

  return { tree };
}

function toKey(value: TreePath) {
  // Stable JSON stringify
  return `{"databaseId":${JSON.stringify(value.databaseId ?? null)},"schemaId":${JSON.stringify(value.schemaId ?? null)},"tableId":${JSON.stringify(value.tableId ?? null)}}`;
}

export function item<T extends Item>(x: Omit<T, "key">): T {
  return {
    ...x,
    key: toKey(x.value),
  } as T;
}

function node<T extends Item>(x: Omit<T, "key">): TreeNode {
  return {
    ...item(x),
    children: [],
  } as TreeNode;
}

export function useExpandedState(path: TreePath) {
  const initialKey = toKey(path);
  const [state, setState] = useState<{ [key: string]: boolean }>({
    [initialKey]: true,
  });

  return {
    isExpanded(key: string) {
      return Boolean(state[key]);
    },
    toggle(key: string) {
      setState((current) => ({
        ...current,
        [key]: !current[key],
      }));
    },
  };
}

export function flatten(
  node: TreeNode,
  isExpanded: (key: string) => boolean,
): Item[] {
  if (node.type === "root") {
    // root node doesn't render a title and is always expanded
    return sort(node.children).flatMap((child) => flatten(child, isExpanded));
  }

  if (!isExpanded(node.key)) {
    return [node];
  }

  return [
    node,
    ...sort(node.children).flatMap((child) => flatten(child, isExpanded)),
  ];
}

function sort(nodes: TreeNode[]): TreeNode[] {
  return Array.from(nodes).sort((a, b) => {
    return a.label.localeCompare(b.label);
  });
}

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

  return { ...a, ...b, children };
}

export function useSearch(query: string) {
  const { data, isLoading } = useSearchQuery(
    query === ""
      ? skipToken
      : {
          q: query,
          models: ["table"],
        },
  );

  const tree: TreeNode = {
    type: "root",
    label: "",
    children: [],
  };

  data?.data.forEach((result) => {
    const { model, database_name, database_id, table_schema, id, name } =
      result;

    if (model !== "table" || database_name === null || table_schema === null) {
      return;
    }

    let databaseNode = tree.children.find(
      (node) =>
        node.type === "database" && node.value.databaseId === database_id,
    );
    if (!databaseNode) {
      databaseNode = node({
        type: "database",
        label: database_name,
        value: {
          databaseId: database_id,
        },
      });
      tree.children.push(databaseNode);
    }

    let schemaNode = databaseNode.children.find(
      (node) => node.type === "schema" && node.value.schemaId === table_schema,
    );
    if (!schemaNode) {
      schemaNode = node({
        type: "schema",
        label: table_schema,
        value: {
          databaseId: database_id,
          schemaId: table_schema,
        },
      });
      databaseNode.children.push(schemaNode);
    }

    let tableNode = schemaNode.children.find(
      (node) => node.type === "table" && node.value.tableId === id,
    );
    if (!tableNode) {
      tableNode = node({
        type: "table",
        label: name,
        value: {
          databaseId: database_id,
          schemaId: table_schema,
          tableId: id,
        },
      });
      schemaNode.children.push(tableNode);
    }
  });

  return {
    isLoading,
    tree,
  };
}
