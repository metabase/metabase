import * as Urls from "metabase/lib/urls";
import { getUrl as getUrl_ } from "metabase/metadata/pages/shared/utils";
import type { PublishModelsResponse } from "metabase-types/api";

import { type NodeSelection, isItemSelected } from "./bulk-selection.utils";
import { CHILD_TYPES, UNNAMED_SCHEMA_NAME } from "./constants";
import type {
  DatabaseNode,
  ExpandedState,
  FilterState,
  FlatItem,
  ItemType,
  NodeKey,
  RootNode,
  TreeNode,
  TreePath,
} from "./types";

export function hasChildren(type: ItemType): boolean {
  return type !== "table";
}

export function getUrl(baseUrl: string, value: TreePath) {
  return getUrl_(baseUrl, {
    fieldId: undefined,
    tableId: undefined,
    databaseId: undefined,
    schemaName: undefined,
    ...value,
  });
}

// Returns a new state object with all the nodes along the path expanded.
// Note: This only expands parent containers (database, schema) but NOT tables,
// to prevent unwanted expansion when navigating via checkbox selection.
export function expandPath(
  state: ExpandedState,
  path: TreePath,
): ExpandedState {
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
    selection?: NodeSelection;
  } = {},
): FlatItem[] {
  const {
    addLoadingNodes,
    isExpanded,
    isSingleSchema,
    canFlattenSingleSchema,
    level = 0,
    parent,
    selection,
  } = opts;
  if (node.type === "root") {
    // root node doesn't render a title and is always expanded
    if (addLoadingNodes && node.children.length === 0) {
      return [
        loadingItem("database", level),
        loadingItem("database", level),
        loadingItem("database", level),
      ];
    }
    return sort(node.children).flatMap((child) => flatten(child, opts));
  }

  const isSelected = selection ? isItemSelected(node, selection) : "no";

  if (
    node.type === "schema" &&
    (node.label === UNNAMED_SCHEMA_NAME ||
      (isSingleSchema && canFlattenSingleSchema))
  ) {
    // Hide nameless schemas in the tree
    return [
      ...sort(node.children).flatMap((child) =>
        flatten(child, {
          ...opts,
          level,
          parent,
        }),
      ),
    ];
  }

  if (typeof isExpanded === "function" && !isExpanded(node.key)) {
    return [{ ...node, level, parent, isSelected }];
  }

  if (addLoadingNodes && node.children.length === 0) {
    const childType = CHILD_TYPES[node.type];
    if (!childType) {
      return [{ ...node, level, parent, isSelected }];
    }
    return [
      { ...node, isExpanded: true, level, parent, isSelected },
      loadingItem(childType, level + 1, node),
    ];
  }

  return [
    { ...node, isExpanded: true, level, parent, isSelected },
    ...sort(node.children).flatMap((child) =>
      flatten(child, {
        ...opts,
        level: level + 1,
        parent: node.key,
        isSingleSchema: node.type === "database" && node.children.length === 1,
      }),
    ),
  ];
}

export function sort(nodes: TreeNode[]): TreeNode[] {
  return Array.from(nodes).sort((a, b) => {
    return a.label.localeCompare(b.label);
  });
}

/**
 * Merge two TreeNodes together.
 */
export function merge(
  a: TreeNode | undefined,
  b: TreeNode | undefined,
): TreeNode {
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
    // @ts-expect-error: we can't type the child node here correctly
    // without checking all the combinations, just assume we are right.
    children,
  };
}

/**
 * Create a unique key for a TreePath
 */
export function toKey({ databaseId, schemaName, tableId }: TreePath) {
  return JSON.stringify([databaseId, schemaName, tableId]);
}

type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

export function node<T extends TreeNode>(
  x: Optional<T, "key" | "children">,
): T {
  return {
    ...x,
    key: toKey(x.value),
    children: x.children ?? [],
  } as T;
}

export function rootNode(children: DatabaseNode[] = []): RootNode {
  return node<RootNode>({
    type: "root",
    label: "",
    value: {},
    children,
  });
}

export function loadingItem(
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
    children: [],
  };
}

export function getFiltersCount(filters: FilterState): number {
  let count = 0;

  if (filters.dataSource != null) {
    ++count;
  }

  if (filters.dataLayer != null) {
    ++count;
  }

  if (filters.ownerEmail != null || filters.ownerUserId != null) {
    ++count;
  }

  if (filters.unusedOnly === true) {
    ++count;
  }

  return count;
}

export function getPublishSeeItLink(response: PublishModelsResponse) {
  if (response.target_collection?.type === "library-models") {
    if (response.created_count === 1) {
      return Urls.dataStudioModel(response.models[0].id);
    } else {
      return Urls.dataStudioCollection(
        response.target_collection?.id ?? "root",
      );
    }
  } else {
    if (response.created_count === 1) {
      return Urls.model(response.models[0]);
    } else {
      return Urls.collection(response.target_collection);
    }
  }
}
