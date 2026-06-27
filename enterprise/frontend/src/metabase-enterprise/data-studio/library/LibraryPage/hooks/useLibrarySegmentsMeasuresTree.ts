import type { ExpandedState } from "@tanstack/react-table";
import { useMemo, useRef } from "react";
import { t } from "ttag";

import {
  useListDatabasesQuery,
  useListMeasuresQuery,
  useListSegmentsQuery,
  useListTablesQuery,
} from "metabase/api";
import type {
  CollectionData,
  TreeItem,
} from "metabase/data-studio/common/types";
import { useSelector } from "metabase/redux";
import { getShallowTables } from "metabase/selectors/metadata";
import type {
  DatabaseId,
  IconName,
  Measure,
  Segment,
  Table,
  TableId,
} from "metabase-types/api";

export type LibraryHierarchyKind = "segments" | "measures";

const EMPTY_HIERARCHY_TREE: TreeItem[] = [];

type HierarchyLeaf = Pick<Segment | Measure, "id" | "name" | "table_id"> & {
  updated_at?: string;
};

type HierarchyLeafData = {
  id: number;
  name: string;
  model: "segment" | "measure";
  table_id: TableId;
  databaseId: DatabaseId;
  schemaName: string;
};

function collectionNode(
  id: string,
  name: string,
  icon: IconName,
  children: TreeItem[],
): TreeItem {
  return {
    id,
    name,
    icon,
    model: "collection",
    data: {
      id,
      name,
      model: "collection",
      description: null,
    } as CollectionData,
    children,
    childrenLoaded: true,
  };
}

type HierarchyTableInfo = Pick<
  Table,
  "id" | "db_id" | "display_name" | "is_published" | "schema"
> & {
  schema_name?: string;
};

function getTableSchemaName(table: HierarchyTableInfo): string {
  return table.schema_name ?? table.schema ?? "";
}

function buildHierarchyTree(
  items: HierarchyLeaf[],
  tablesById: Map<TableId, HierarchyTableInfo>,
  dbNameById: Map<DatabaseId, string>,
  kind: LibraryHierarchyKind,
): TreeItem[] {
  const leafIcon: IconName = kind === "segments" ? "segment" : "sum";
  const leafModel = kind === "segments" ? "segment" : "measure";

  const dbGroups = new Map<DatabaseId, Map<string, Map<TableId, TreeItem[]>>>();

  for (const item of items) {
    const table = tablesById.get(item.table_id);
    if (!table?.is_published) {
      continue;
    }

    const databaseId = table.db_id;
    const schemaName = getTableSchemaName(table);
    const tableId = table.id;

    const schemaGroups = dbGroups.get(databaseId) ?? new Map();
    dbGroups.set(databaseId, schemaGroups);
    const tableGroups = schemaGroups.get(schemaName) ?? new Map();
    schemaGroups.set(schemaName, tableGroups);
    const leaves = tableGroups.get(tableId) ?? [];
    tableGroups.set(tableId, leaves);

    leaves.push({
      id: `${leafModel}:${item.id}`,
      name: item.name,
      icon: leafIcon,
      model: leafModel,
      updatedAt: item.updated_at,
      data: {
        id: item.id,
        name: item.name,
        model: leafModel,
        table_id: item.table_id,
        databaseId,
        schemaName,
      } as HierarchyLeafData as TreeItem["data"],
      children: undefined,
    });
  }

  const byName = (a: { name: string }, b: { name: string }) =>
    a.name.localeCompare(b.name);

  return [...dbGroups.entries()]
    .map(([databaseId, schemaGroups]) =>
      collectionNode(
        `${kind}-db:${databaseId}`,
        dbNameById.get(databaseId) ?? t`Unknown database`,
        "database",
        [...schemaGroups.entries()]
          .map(([schemaName, tableGroups]) =>
            collectionNode(
              `${kind}-db:${databaseId}-schema:${schemaName}`,
              schemaName || t`Default`,
              "folder",
              [...tableGroups.entries()]
                .map(([tableId, leaves]) =>
                  collectionNode(
                    `${kind}-table:${tableId}`,
                    tablesById.get(tableId)?.display_name ?? t`Unknown table`,
                    "table",
                    leaves.sort(byName),
                  ),
                )
                .sort(byName),
            ),
          )
          .sort(byName),
      ),
    )
    .sort(byName);
}

/** Expand database and schema rows by default on hierarchy library pages. */
export function getHierarchyDatabaseSchemaExpandedIds(
  tree: TreeItem[],
): ExpandedState {
  const ids: ExpandedState = {};
  for (const dbNode of tree) {
    ids[dbNode.id] = true;
    for (const schemaNode of dbNode.children ?? []) {
      ids[schemaNode.id] = true;
    }
  }
  return ids;
}

/** Stable signature of database + schema node ids for expansion state. */
export function getHierarchyDatabaseSchemaExpandSignature(
  tree: TreeItem[],
): string {
  const ids: string[] = [];
  for (const dbNode of tree) {
    ids.push(String(dbNode.id));
    for (const schemaNode of dbNode.children ?? []) {
      ids.push(String(schemaNode.id));
    }
  }
  return ids.sort().join("|");
}

/** Stable signature of the full hierarchy tree structure and leaf ids. */
export function getHierarchyTreeStructureSignature(tree: TreeItem[]): string {
  const ids: string[] = [];
  const walk = (nodes: TreeItem[]) => {
    for (const node of nodes) {
      ids.push(String(node.id));
      if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return ids.join("|");
}

export function useLibrarySegmentsMeasuresTree(
  kind: LibraryHierarchyKind | null,
) {
  const { data: segments = [], isLoading: loadingSegments } =
    useListSegmentsQuery(undefined, { skip: kind !== "segments" });
  const { data: measures = [], isLoading: loadingMeasures } =
    useListMeasuresQuery(undefined, { skip: kind !== "measures" });
  const { data: databasesData, isLoading: loadingDatabases } =
    useListDatabasesQuery(undefined, { skip: kind == null });
  const { data: apiTables = [], isLoading: loadingTables } = useListTablesQuery(
    { skip_fields: true },
    { skip: kind == null },
  );
  const shallowTables = useSelector(getShallowTables);

  const { tablesById, dbNameById } = useMemo(() => {
    const tablesById = new Map<TableId, HierarchyTableInfo>();
    const dbNameById = new Map<DatabaseId, string>();
    for (const database of databasesData?.data ?? []) {
      dbNameById.set(database.id, database.name);
    }
    for (const table of apiTables) {
      tablesById.set(table.id, table);
    }
    for (const table of Object.values(shallowTables)) {
      const existing = tablesById.get(table.id);
      tablesById.set(
        table.id,
        existing
          ? {
              ...existing,
              ...table,
              schema: existing.schema ?? table.schema_name,
            }
          : {
              id: table.id,
              db_id: table.db_id,
              display_name: table.display_name,
              is_published: table.is_published,
              schema: table.schema_name ?? "",
              schema_name: table.schema_name,
            },
      );
    }
    return { tablesById, dbNameById };
  }, [shallowTables, databasesData, apiTables]);

  const stableTreeRef = useRef(EMPTY_HIERARCHY_TREE);
  const stableTreeSignatureRef = useRef<string | null>(null);

  const tree = useMemo(() => {
    if (kind == null) {
      stableTreeSignatureRef.current = null;
      stableTreeRef.current = EMPTY_HIERARCHY_TREE;
      return EMPTY_HIERARCHY_TREE;
    }

    const items = kind === "segments" ? segments : measures;
    if (items.length === 0) {
      stableTreeSignatureRef.current = null;
      stableTreeRef.current = EMPTY_HIERARCHY_TREE;
      return EMPTY_HIERARCHY_TREE;
    }

    const built = buildHierarchyTree(items, tablesById, dbNameById, kind);
    if (built.length === 0) {
      stableTreeSignatureRef.current = null;
      stableTreeRef.current = EMPTY_HIERARCHY_TREE;
      return EMPTY_HIERARCHY_TREE;
    }

    const signature = getHierarchyTreeStructureSignature(built);
    if (signature === stableTreeSignatureRef.current) {
      return stableTreeRef.current;
    }

    stableTreeSignatureRef.current = signature;
    stableTreeRef.current = built;
    return built;
  }, [kind, segments, measures, tablesById, dbNameById]);

  const isLoading =
    kind === "segments"
      ? loadingSegments || loadingDatabases || loadingTables
      : kind === "measures"
        ? loadingMeasures || loadingDatabases || loadingTables
        : false;

  const rawItemCount =
    kind === "segments"
      ? segments.length
      : kind === "measures"
        ? measures.length
        : 0;

  return {
    tree,
    isLoading,
    rawItemCount,
  };
}
