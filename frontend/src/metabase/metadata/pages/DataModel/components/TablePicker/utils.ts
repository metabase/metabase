import { useCallback, useEffect, useState } from "react";

import {
  useLazyListDatabaseSchemaTablesQuery,
  useLazyListDatabaseSchemasQuery,
  useLazyListDatabasesQuery,
} from "metabase/api";
import type { IconName } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

export function getIconForType(
  type: "database" | "schema" | "table",
): IconName {
  if (type === "table") {
    return "table2";
  }
  return type;
}

export function hasChildren(type: "database" | "schema" | "table"): boolean {
  return type !== "table";
}

export type TreePath = {
  databaseId?: DatabaseId;
  schemaId?: SchemaId;
  tableId?: TableId;
};

type NodeType = "root" | "database" | "schema" | "table";

type TreeNode = {
  type: NodeType;
  label: string;
  children: TreeNode[];
  value: TreePath;
  complete?: boolean;
};

export function useTableLoader(path: TreePath) {
  const [fetchDatabases] = useLazyListDatabasesQuery();
  const [fetchSchemas] = useLazyListDatabaseSchemasQuery();
  const [fetchTables] = useLazyListDatabaseSchemaTablesQuery();

  const [tree, setTree] = useState<TreeNode>({
    type: "root",
    label: "Root",
    complete: false,
    value: {},
    children: [],
  });

  const load = useCallback(
    async function (path: TreePath) {
      const { databaseId, schemaId } = path;
      const schema = schemaId?.replace(/^\d+:/, "");

      const shouldFetchSchemas = databaseId !== undefined;
      const shouldFetchTables =
        databaseId !== undefined && schema !== undefined;

      const [databases, schemas, tables] = await Promise.all([
        fetchDatabases({}, true),
        shouldFetchSchemas ? fetchSchemas({ id: databaseId }, true) : null,
        shouldFetchTables
          ? fetchTables({ id: databaseId, schema }, true)
          : null,
      ]);

      const newTree: TreeNode = {
        type: "root",
        complete: true,
        label: "Root",
        value: {},
        children:
          databases?.data?.data.map((database) => ({
            type: "database",
            label: database.name,
            value: { databaseId: database.id },
            complete: database.id === databaseId && shouldFetchSchemas,
            children:
              database.id === databaseId
                ? (schemas?.data?.map((schemaId_) => ({
                    type: "schema",
                    complete: schema === schemaId_ && shouldFetchTables,
                    label: schemaId_,
                    value: {
                      databaseId: database.id,
                      schemaId: schemaId_,
                    },
                    children:
                      schema === schemaId_
                        ? (tables?.data?.map((table) => ({
                            type: "table",
                            complete: true,
                            label: table.name,
                            value: {
                              databaseId: database.id,
                              schemaId: schemaId_,
                              tableId: table.id,
                            },
                            children: [],
                          })) ?? [])
                        : [],
                  })) ?? [])
                : [],
          })) ?? [],
      };
      setTree((current) => merge(current, newTree));
    },
    [fetchDatabases, fetchSchemas, fetchTables],
  );

  useEffect(() => {
    load(path);
  }, [path, load]);

  return {
    tree,
  };
}

export function toKey(value: TreePath) {
  return `{"databaseId":${JSON.stringify(value.databaseId ?? null)},"schemaId":${JSON.stringify(value.schemaId ?? null)},"tableId":${JSON.stringify(value.tableId ?? null)}}`;
}
export function toValue(key: string): TreePath {
  const { databaseId, schemaId, tableId } = JSON.parse(key);
  return {
    databaseId: databaseId ?? undefined,
    schemaId: schemaId ?? undefined,
    tableId: tableId ?? undefined,
  };
}

export function useExpandedState(path: TreePath) {
  const initialKey = toKey(path);
  const [state, setState] = useState<{ [key: string]: boolean }>({
    [initialKey]: true,
  });

  return {
    isExpanded: (path: TreePath | string) => {
      const key = typeof path === "string" ? path : toKey(path);
      return Boolean(state[key]);
    },
    toggle: (path: TreePath | string) => {
      const key = typeof path === "string" ? path : toKey(path);
      setState((current) => ({
        ...current,
        [key]: !current[key],
      }));
    },
  };
}

export type Item = {
  type: NodeType;
  label: string;
  complete?: boolean;
  value: TreePath;
  key: string;
};

export function flatten(
  tree: TreeNode,
  isExpanded: (key: string) => boolean,
): Item[] {
  if (!tree) {
    return [];
  }
  if (tree.type === "root") {
    return sort(tree.children).flatMap((child) => flatten(child, isExpanded));
  }

  const key = toKey(tree.value);
  const expanded = isExpanded(key);

  if (tree.type === "database") {
    return [
      {
        type: "database",
        label: tree.label,
        complete: tree.complete,
        value: tree.value,
        key: toKey(tree.value),
      },
      ...(expanded
        ? sort(tree.children).flatMap((child) => flatten(child, isExpanded))
        : []),
    ];
  }
  if (tree.type === "schema") {
    return [
      {
        type: "schema",
        label: tree.label,
        complete: tree.complete,
        value: tree.value,
        key: toKey(tree.value),
      },
      ...(expanded
        ? sort(tree.children).flatMap((child) => flatten(child, isExpanded))
        : []),
    ];
  }
  return [
    {
      type: "table",
      label: tree.label,
      value: tree.value,
      key: toKey(tree.value),
    },
  ];
}

function sort(nodes: TreeNode[]): TreeNode[] {
  return Array.from(nodes).sort((a, b) => {
    return a.label.localeCompare(b.label);
  });
}

function merge(a: TreeNode, b: TreeNode): TreeNode {
  if (!a.complete) {
    return b;
  }
  if (!b.complete) {
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
    children,
  };
}
