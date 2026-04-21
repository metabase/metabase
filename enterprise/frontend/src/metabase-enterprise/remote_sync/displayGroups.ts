import { t } from "ttag";
import _ from "underscore";

import { isLibraryCollection } from "metabase/collections/utils";
import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  RemoteSyncEntity,
  RemoteSyncEntityModel,
  RemoteSyncEntityStatus,
} from "metabase-types/api";

/**
 * Sentinel value for the virtual Transforms root collection.
 * Used to represent the entire transforms feature being enabled/disabled.
 */
export const TRANSFORMS_ROOT_ID = -1;

/**
 * Configuration for how entities are grouped and displayed in the changes view.
 * Similar to the backend remote-sync-specs pattern.
 */
export type DisplayGroupSpec = {
  /** Unique identifier for this group */
  id: string;
  /** Collection namespace to match (e.g., "transforms", "snippets") */
  namespace?: string;
  /** Model types that belong to this group */
  models?: Set<RemoteSyncEntityModel>;
  /** Virtual root ID for groups that have a synthetic root (e.g., -1 for Transforms) */
  virtualRootId?: number;
  /** i18n function for virtual root name */
  virtualRootName?: () => string;
  /** Icon to display for this group's collections */
  icon: IconName;
  /** ID of another group whose path should be prepended */
  pathPrefixGroupId?: string;
  /** Priority for matching (higher values checked first) */
  priority: number;
};

/**
 * Display group specifications ordered by priority (highest first).
 * Each spec defines how a category of entities should be grouped and displayed.
 */
const displayGroupSpecs: DisplayGroupSpec[] = [
  {
    id: "transforms",
    namespace: "transforms",
    models: new Set(["transform", "transformtag", "pythonlibrary"]),
    virtualRootId: TRANSFORMS_ROOT_ID,
    virtualRootName: () => t`Transforms`,
    icon: "transform",
    priority: 100,
  },
  {
    id: "snippets",
    namespace: "snippets",
    models: new Set(["nativequerysnippet"]),
    icon: "snippet",
    pathPrefixGroupId: "library",
    priority: 90,
  },
  {
    id: "tables",
    models: new Set(["table", "field", "segment", "measure"]),
    icon: "synced_collection",
    priority: 50,
  },
  {
    id: "default",
    icon: "synced_collection",
    priority: 0,
  },
];

/**
 * Map of namespace string to set of collection IDs in that namespace.
 */
export type NamespaceCollectionMap = Map<string, Set<number>>;

/**
 * Build a map from namespace to collection IDs in a single pass.
 */
export const buildNamespaceCollectionMap = (
  collectionTree: Collection[],
): NamespaceCollectionMap => {
  const map = new Map<string, Set<number>>();

  const collectIds = (collections: Collection[]) => {
    for (const collection of collections) {
      if (
        typeof collection.id === "number" &&
        collection.namespace &&
        typeof collection.namespace === "string"
      ) {
        const existing = map.get(collection.namespace);
        if (existing) {
          existing.add(collection.id);
        } else {
          map.set(collection.namespace, new Set([collection.id]));
        }
      }
      if (collection.children) {
        collectIds(collection.children);
      }
    }
  };

  collectIds(collectionTree);
  return map;
};

/**
 * Find the display group spec that matches an entity.
 * Checks in priority order: model match, then namespace match (for collections).
 */
const getSpecForEntity = (
  entity: RemoteSyncEntity,
  namespaceCollectionMap: NamespaceCollectionMap,
): DisplayGroupSpec => {
  for (const spec of displayGroupSpecs) {
    if (spec.models?.has(entity.model)) {
      return spec;
    }
    if (entity.model === "collection" && spec.namespace) {
      const namespaceIds = namespaceCollectionMap.get(spec.namespace);
      if (namespaceIds?.has(entity.id)) {
        return spec;
      }
    }
    if (entity.collection_id != null && spec.namespace) {
      const namespaceIds = namespaceCollectionMap.get(spec.namespace);
      if (namespaceIds?.has(entity.collection_id)) {
        return spec;
      }
    }
  }
  return displayGroupSpecs[displayGroupSpecs.length - 1];
};

/**
 * Result of getGroupKeyInfo containing both the group key and the matched spec.
 */
type GroupKeyInfo = {
  groupKey: string | number;
  spec: DisplayGroupSpec;
};

/**
 * Determine the group key for an entity based on its spec.
 * Returns both the key and the spec for use in rendering.
 */
const getGroupKeyInfo = (
  entity: RemoteSyncEntity,
  spec: DisplayGroupSpec,
  libraryCollectionId: number | null,
  transformsRootExists: boolean,
): GroupKeyInfo => {
  if (entity.model === "collection" && entity.id === TRANSFORMS_ROOT_ID) {
    return { groupKey: "transforms-root", spec };
  }
  if (spec.id === "transforms") {
    if (transformsRootExists || entity.collection_id == null) {
      return { groupKey: "transforms-root", spec };
    }
    return { groupKey: entity.collection_id, spec };
  }
  if (entity.collection_id != null) {
    return { groupKey: entity.collection_id, spec };
  }
  if (spec.id === "snippets" && libraryCollectionId != null) {
    return { groupKey: libraryCollectionId, spec };
  }
  return { groupKey: 0, spec };
};

/**
 * Get the icon name for a display group.
 */
export const getGroupIcon = (spec: DisplayGroupSpec): IconName => {
  return spec.icon;
};

/**
 * Check if a collection is in a specific namespace.
 */
const isCollectionInNamespace = (
  collectionId: number,
  namespace: string,
  namespaceCollectionMap: NamespaceCollectionMap,
): boolean => {
  const namespaceIds = namespaceCollectionMap.get(namespace);
  return namespaceIds?.has(collectionId) ?? false;
};

/**
 * Find the Library collection in the collection tree.
 */
export const findLibraryCollectionId = (
  collectionTree: Collection[],
): number | null => {
  const findLibrary = (collections: Collection[]): number | null => {
    for (const col of collections) {
      if (isLibraryCollection(col)) {
        return typeof col.id === "number" ? col.id : null;
      }
      if (col.children?.length) {
        const found = findLibrary(col.children);
        if (found !== null) {
          return found;
        }
      }
    }
    return null;
  };
  return findLibrary(collectionTree);
};

export type CollectionPathSegment = {
  id: CollectionId;
  name: string;
};

/**
 * Get path prefix segments for entities that need a virtual parent path.
 * For example, snippet collections get "Library" prepended, transforms collections get "Transforms" prepended.
 */
const getPathPrefixSegments = (
  spec: DisplayGroupSpec,
  collectionId: number | undefined,
  namespaceCollectionMap: NamespaceCollectionMap,
  collectionMap: Map<number, Collection>,
  libraryCollectionId: number | null,
): CollectionPathSegment[] => {
  if (spec.id === "transforms" && spec.virtualRootId != null) {
    return [{ id: spec.virtualRootId, name: spec.virtualRootName?.() ?? "" }];
  }
  if (
    spec.pathPrefixGroupId === "library" &&
    libraryCollectionId != null &&
    collectionId !== libraryCollectionId &&
    collectionId != null &&
    isCollectionInNamespace(collectionId, "snippets", namespaceCollectionMap)
  ) {
    const libraryCollection = collectionMap.get(libraryCollectionId);
    if (libraryCollection) {
      return [{ id: libraryCollection.id, name: libraryCollection.name }];
    }
  }
  return [];
};

/**
 * Get the spec by ID.
 */
const getSpecById = (id: string): DisplayGroupSpec | undefined => {
  return displayGroupSpecs.find((spec) => spec.id === id);
};

/**
 * Models that are children of tables (get their collection from a parent table)
 */
const TABLE_CHILD_MODELS: Set<RemoteSyncEntityModel> = new Set([
  "field",
  "segment",
  "measure",
]);

/**
 * Check if a model type is a child of a table (field, segment, or measure)
 */
export const isTableChildModel = (model: RemoteSyncEntityModel): boolean => {
  return TABLE_CHILD_MODELS.has(model);
};

/** A table group with optional entity (when table itself is dirty) and its nested children */
export type TableGroup = {
  tableId: number;
  tableName: string;
  table?: RemoteSyncEntity;
  children: RemoteSyncEntity[];
};

/** A collection group with display metadata */
export type CollectionGroup = {
  pathSegments: CollectionPathSegment[];
  collectionId: number | undefined;
  collectionEntity: RemoteSyncEntity | undefined;
  tableGroups: TableGroup[];
  items: RemoteSyncEntity[];
  spec: DisplayGroupSpec;
  isTransformsRoot: boolean;
};

/** Order for sorting entities by sync status */
const SYNC_STATUS_ORDER: RemoteSyncEntityStatus[] = [
  "create",
  "update",
  "touch",
  "delete",
];

/**
 * Sort entities by sync status (create, update, touch, delete) then by name.
 * Returns a new sorted array.
 */
const sortEntitiesByStatus = (
  items: RemoteSyncEntity[],
): RemoteSyncEntity[] => {
  return [...items].sort((a, b) => {
    const statusOrderA = SYNC_STATUS_ORDER.indexOf(a.sync_status);
    const statusOrderB = SYNC_STATUS_ORDER.indexOf(b.sync_status);
    if (statusOrderA !== statusOrderB) {
      return statusOrderA - statusOrderB;
    }
    return a.name.localeCompare(b.name);
  });
};

/**
 * Build table groups from a list of entities.
 * Groups table children under their parent tables, creating groups for both
 * dirty tables and orphan children (children whose parent table is not dirty).
 */
const buildTableGroups = (items: RemoteSyncEntity[]): TableGroup[] => {
  const tables = items.filter((item) => item.model === "table");
  const tableChildren = items.filter((item) => isTableChildModel(item.model));
  const childrenByTableId = _.groupBy(tableChildren, (e) => e.table_id || 0);
  const tableIds = new Set(tables.map((tbl) => tbl.id));

  const dirtyTableGroups: TableGroup[] = tables.map((table) => ({
    tableId: table.id,
    tableName: table.name,
    table,
    children: sortEntitiesByStatus(childrenByTableId[table.id] || []),
  }));

  const orphanTableGroups: TableGroup[] = Object.entries(childrenByTableId)
    .filter(([tableId]) => !tableIds.has(Number(tableId)))
    .map(([tableId, children]) => ({
      tableId: Number(tableId),
      tableName: children[0]?.table_name ?? t`Unknown table`,
      children: sortEntitiesByStatus(children),
    }));

  return [...dirtyTableGroups, ...orphanTableGroups].sort((a, b) =>
    a.tableName.localeCompare(b.tableName),
  );
};

/**
 * Filter items to get non-table, non-table-child entities.
 * Excludes the collection entity itself and the transforms root if applicable.
 */
const filterOtherItems = (
  items: RemoteSyncEntity[],
  collectionId: string,
  isTransformsRoot: boolean,
): RemoteSyncEntity[] => {
  return items.filter((item) => {
    if (
      isTransformsRoot &&
      item.model === "collection" &&
      item.id === TRANSFORMS_ROOT_ID
    ) {
      return false;
    }
    return (
      item.model !== "table" &&
      !isTableChildModel(item.model) &&
      !(item.model === "collection" && item.id === Number(collectionId))
    );
  });
};

/** Parameters for building a collection group */
type BuildCollectionGroupParams = {
  collectionId: string;
  items: RemoteSyncEntity[];
  transformsRootEntity: RemoteSyncEntity | undefined;
  namespaceCollectionMap: NamespaceCollectionMap;
  collectionMap: Map<number, Collection>;
  libraryCollectionId: number | null;
  getCollectionPathSegments: (
    collectionId: number | undefined,
    collectionMap: Map<number, Collection>,
  ) => CollectionPathSegment[];
};

/**
 * Build a single collection group from a collection ID and its items.
 */
const buildCollectionGroup = ({
  collectionId,
  items,
  transformsRootEntity,
  namespaceCollectionMap,
  collectionMap,
  libraryCollectionId,
  getCollectionPathSegments,
}: BuildCollectionGroupParams): CollectionGroup => {
  const isTransformsRoot = collectionId === "transforms-root";
  const collectionEntity = isTransformsRoot
    ? transformsRootEntity
    : items.find(
        (item) =>
          item.model === "collection" && item.id === Number(collectionId),
      );
  const firstItem = items[0];
  const groupSpec = firstItem
    ? getSpecForEntity(firstItem, namespaceCollectionMap)
    : getSpecById("default")!;
  const tableGroups = buildTableGroups(items);
  const otherItems = filterOtherItems(items, collectionId, isTransformsRoot);
  const numericCollectionId = isTransformsRoot
    ? TRANSFORMS_ROOT_ID
    : Number(collectionId) || undefined;

  let pathSegments = isTransformsRoot
    ? [{ id: TRANSFORMS_ROOT_ID, name: t`Transforms` }]
    : getCollectionPathSegments(numericCollectionId, collectionMap);
  const prefixSegments = getPathPrefixSegments(
    groupSpec,
    numericCollectionId,
    namespaceCollectionMap,
    collectionMap,
    libraryCollectionId,
  );
  if (prefixSegments.length > 0 && !isTransformsRoot) {
    pathSegments = [...prefixSegments, ...pathSegments];
  }

  return {
    pathSegments,
    collectionId: numericCollectionId,
    collectionEntity,
    tableGroups,
    items: sortEntitiesByStatus(otherItems),
    spec: groupSpec,
    isTransformsRoot,
  };
};

/** Parameters for grouping entities into collection groups */
type GroupEntitiesParams = {
  entities: RemoteSyncEntity[];
  transformsRootEntity: RemoteSyncEntity | undefined;
  namespaceCollectionMap: NamespaceCollectionMap;
  collectionMap: Map<number, Collection>;
  libraryCollectionId: number | null;
  getCollectionPathSegments: (
    collectionId: number | undefined,
    collectionMap: Map<number, Collection>,
  ) => CollectionPathSegment[];
};

/**
 * Group entities by collection and build collection groups.
 * This is the main orchestration function for the changes view grouping logic.
 */
export const groupEntitiesByCollection = ({
  entities,
  transformsRootEntity,
  namespaceCollectionMap,
  collectionMap,
  libraryCollectionId,
  getCollectionPathSegments,
}: GroupEntitiesParams): CollectionGroup[] => {
  const transformsRootExists = transformsRootEntity != null;
  const byCollection = _.groupBy(entities, (e) => {
    const spec = getSpecForEntity(e, namespaceCollectionMap);
    const { groupKey } = getGroupKeyInfo(
      e,
      spec,
      libraryCollectionId,
      transformsRootExists,
    );
    return groupKey;
  });

  return Object.entries(byCollection)
    .map(([collectionId, items]) =>
      buildCollectionGroup({
        collectionId,
        items,
        transformsRootEntity,
        namespaceCollectionMap,
        collectionMap,
        libraryCollectionId,
        getCollectionPathSegments,
      }),
    )
    .sort((a, b) =>
      a.pathSegments
        .map((s) => s.name)
        .join(" / ")
        .localeCompare(b.pathSegments.map((s) => s.name).join(" / ")),
    );
};
