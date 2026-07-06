import { useMemo, useRef } from "react";
import { t } from "ttag";

import {
  useListMeasuresQuery,
  useListSegmentsQuery,
  useListTablesQuery,
} from "metabase/api";
import type { TreeItem } from "metabase/data-studio/common/types";
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
  kind: LibraryHierarchyKind,
): TreeItem[] {
  const leafIcon: IconName = kind === "segments" ? "segment" : "sum";
  const leafModel = kind === "segments" ? "segment" : "measure";

  const tableGroups = new Map<TableId, TreeItem[]>();

  for (const item of items) {
    const table = tablesById.get(item.table_id);
    if (!table?.is_published) {
      continue;
    }

    const databaseId = table.db_id;
    const schemaName = getTableSchemaName(table);
    const tableId = table.id;

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

  return [...tableGroups.entries()]
    .map(([tableId, leaves]) => {
      const displayName =
        tablesById.get(tableId)?.display_name ?? t`Unknown table`;
      return {
        id: `${kind}-table:${tableId}`,
        name: displayName,
        icon: "table" as IconName,
        model: "table" as const,
        data: {
          id: tableId,
          name: displayName,
          model: "table" as const,
        },
        children: leaves.sort(byName),
        childrenLoaded: true,
      };
    })
    .sort(byName);
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
  const { data: apiTables = [], isLoading: loadingTables } = useListTablesQuery(
    { skip_fields: true },
    { skip: kind == null },
  );
  const shallowTables = useSelector(getShallowTables);

  const tablesById = useMemo(() => {
    const tablesById = new Map<TableId, HierarchyTableInfo>();
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
    return tablesById;
  }, [shallowTables, apiTables]);

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

    const built = buildHierarchyTree(items, tablesById, kind);
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
  }, [kind, segments, measures, tablesById]);

  const isLoading =
    kind === "segments"
      ? loadingSegments || loadingTables
      : kind === "measures"
        ? loadingMeasures || loadingTables
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
