import { t } from "ttag";

import type { ColorName } from "metabase/ui/colors/types";
import type {
  Collection,
  CollectionType,
  IconName,
  RemoteSyncDependencyEntity,
  RemoteSyncDependencyFailure,
  RemoteSyncEntityStatus,
  RemoteSyncIneligibleDependency,
  RemoteSyncRemedyCollection,
  SettingDefinition,
} from "metabase-types/api";

import type { CollectionPathSegment } from "./displayGroups";

// Re-export from displayGroups for backwards compatibility
export {
  TRANSFORMS_ROOT_ID,
  isTableChildModel,
  type CollectionPathSegment,
} from "./displayGroups";

type ErrorData = {
  message?: string;
  conflicts?: boolean;
  /** Set by the backend CAS guard when the requested branch != the configured remote-sync-branch. */
  branch_mismatch?: boolean;
  /** The authoritative branch the instance is actually on, when branch_mismatch is set. */
  current_branch?: string;
};

export type SyncError = {
  data?: ErrorData;
  message?: string;
};

type ParsedError = {
  errorMessage: string | null;
  hasConflict: boolean;
  /** True when the request was rejected because the branch changed in another session. */
  hasBranchMismatch: boolean;
  /** The branch the instance is actually on, when hasBranchMismatch is true. */
  currentBranch: string | null;
};

// TODO: Should merge with getExtraFormFieldProps from admin/settings/utils.ts
export const getEnvSettingProps = <T>(
  setting?: SettingDefinition,
  extras?: T,
) => {
  if (setting?.is_env_setting) {
    return {
      description: t`Using ${setting.env_name}`,
      readOnly: true,
      ...extras,
    };
  }
  return {};
};

export const getSyncStatusIcon = (status: RemoteSyncEntityStatus): IconName => {
  switch (status) {
    case "create":
      return "add";
    case "removed":
    case "delete":
      return "trash";
    case "update":
    case "touch":
      return "pencil";
    default:
      return "warning";
  }
};

export const getSyncStatusColor = (
  status: RemoteSyncEntityStatus,
): ColorName => {
  switch (status) {
    case "create":
      return "feedback-positive";
    case "removed":
    case "delete":
      return "feedback-negative";
    case "update":
    case "touch":
      return "core-blue-saturated";
    default:
      return "core-info";
  }
};

const isValidErrorData = (data: unknown): data is ErrorData =>
  typeof data === "object" && data !== null;

const hasConflictProperty = (data: ErrorData): boolean => !!data.conflicts;

const getErrorMessage = (data: ErrorData): string | undefined =>
  "message" in data && typeof data.message === "string"
    ? data.message
    : undefined;

export const parseSyncError = (exportError: SyncError | null): ParsedError => {
  if (!exportError) {
    return {
      errorMessage: null,
      hasConflict: false,
      hasBranchMismatch: false,
      currentBranch: null,
    };
  }

  if (
    "data" in exportError &&
    exportError.data &&
    isValidErrorData(exportError.data)
  ) {
    const errorData = exportError.data;
    const messageFromData = getErrorMessage(errorData);
    const hasConflict = hasConflictProperty(errorData);

    if (errorData.branch_mismatch) {
      const currentBranch = errorData.current_branch ?? null;
      return {
        errorMessage:
          messageFromData ||
          t`The sync branch changed in another session. Refresh the page and try again.`,
        hasConflict: false,
        hasBranchMismatch: true,
        currentBranch,
      };
    }

    if (hasConflict) {
      return {
        errorMessage:
          messageFromData ||
          t`Your changes conflict with the remote repository. You can force push to override them.`,
        hasConflict: true,
        hasBranchMismatch: false,
        currentBranch: null,
      };
    }

    return {
      errorMessage:
        messageFromData || t`Something went wrong. Please try again.`,
      hasConflict: false,
      hasBranchMismatch: false,
      currentBranch: null,
    };
  }

  if ("message" in exportError && typeof exportError.message === "string") {
    return {
      errorMessage:
        exportError.message || t`Something went wrong. Please try again.`,
      hasConflict: false,
      hasBranchMismatch: false,
      currentBranch: null,
    };
  }

  return {
    errorMessage: t`Something went wrong. Please try again.`,
    hasConflict: false,
    hasBranchMismatch: false,
    currentBranch: null,
  };
};

// Deduped because remedies point at top-level collections, so dependencies collapse onto the same one.
export const getRequiredCollections = (
  failures: RemoteSyncDependencyFailure[],
): RemoteSyncRemedyCollection[] => {
  const collections = failures
    .flatMap((failure) => failure.dependencies)
    .flatMap((dependency) =>
      dependency.remedy.type === "collection"
        ? [dependency.remedy.collection]
        : [],
    );

  const byId = new Map<number, RemoteSyncRemedyCollection>(
    collections.map((collection) => [collection.id, collection]),
  );

  return [...byId.values()];
};

/** Identity for a dependency or one of its referrers — neither is unique on `id` alone. */
export const getEntityKey = ({
  model,
  id,
}: Pick<RemoteSyncDependencyEntity, "model" | "id">): string =>
  `${model}:${id}`;

export const ROOT_COLLECTION_ROW_ID = "root";

export type RequiredCollectionRow = {
  id: number | typeof ROOT_COLLECTION_ROW_ID;
  name: string;
  /** Drives the icon, so the Library and friends read the same here as in the settings list. */
  type: CollectionType;
  personal: boolean;
  syncable: boolean;
};

const getUnsyncableRows = (
  failures: RemoteSyncDependencyFailure[],
): RequiredCollectionRow[] => {
  const rows = failures
    .flatMap((failure) => failure.dependencies)
    .filter((dependency) => dependency.remedy.type === "none")
    .flatMap((dependency): RequiredCollectionRow[] => {
      const { collection } = dependency;

      // Absent means the backend couldn't resolve one, so there is nothing honest to name.
      if (collection === undefined) {
        return [];
      }
      // The dependency only tells us where it lives, not what kind of collection that is.
      return collection === null
        ? [
            {
              id: ROOT_COLLECTION_ROW_ID,
              name: t`Our analytics`,
              type: null,
              personal: false,
              syncable: false,
            },
          ]
        : [{ ...collection, type: null, personal: false, syncable: false }];
    });

  return [...new Map(rows.map((row) => [row.id, row])).values()];
};

export const getRequiredCollectionRows = (
  failures: RemoteSyncDependencyFailure[],
): RequiredCollectionRow[] => [
  ...getRequiredCollections(failures).map(({ id, name, type, personal }) => ({
    id,
    name,
    type,
    personal,
    syncable: !personal,
  })),
  ...getUnsyncableRows(failures),
];

export const isSyncableRow = (
  row: RequiredCollectionRow,
): row is RequiredCollectionRow & { id: number } =>
  row.syncable && typeof row.id === "number";

const getUniqueDependencies = (
  failures: RemoteSyncDependencyFailure[],
): RemoteSyncIneligibleDependency[] => [
  ...new Map(
    failures
      .flatMap((failure) => failure.dependencies)
      .map((dependency) => [getEntityKey(dependency), dependency]),
  ).values(),
];

const getDependencyRowId = ({
  remedy,
  collection,
}: RemoteSyncIneligibleDependency): RequiredCollectionRow["id"] | null => {
  if (remedy.type === "collection") {
    return remedy.collection.id;
  }
  // The Library carries no id of its own, and an unresolved collection gives us nothing to name.
  if (remedy.type === "library" || collection === undefined) {
    return null;
  }
  return collection === null ? ROOT_COLLECTION_ROW_ID : collection.id;
};

export const getRowDependencies = (
  failures: RemoteSyncDependencyFailure[],
): Map<RequiredCollectionRow["id"], RemoteSyncIneligibleDependency[]> => {
  const byRow = new Map<
    RequiredCollectionRow["id"],
    RemoteSyncIneligibleDependency[]
  >();

  getUniqueDependencies(failures).forEach((dependency) => {
    const rowId = getDependencyRowId(dependency);

    if (rowId != null) {
      byRow.set(rowId, [...(byRow.get(rowId) ?? []), dependency]);
    }
  });

  return byRow;
};

export type BlockedReason =
  | "personal-content"
  | "unsyncable-content"
  | "library-missing"
  | "linked-collections";

// Ordered so content that can't be synced at all outranks content that can.
export const getBlockedReason = (
  failures: RemoteSyncDependencyFailure[],
): BlockedReason => {
  if (isBlockedByPersonalContent(failures)) {
    return "personal-content";
  }
  if (requiresContentMove(failures)) {
    return "unsyncable-content";
  }
  if (isBlockedByMissingLibrary(failures)) {
    return "library-missing";
  }
  return "linked-collections";
};

// `personal` sits on the remedy — the top-level ancestor — not the collection the dependency is in.
const isBlockedByPersonalContent = (
  failures: RemoteSyncDependencyFailure[],
): boolean =>
  failures.some((failure) =>
    failure.dependencies.some(
      (dependency) =>
        dependency.remedy.type === "collection" &&
        dependency.remedy.collection.personal,
    ),
  );

// A `library` remedy is the backend saying this instance has no Library at all — once one exists a
// snippet points at it as an ordinary collection remedy, like anything else.
const isBlockedByMissingLibrary = (
  failures: RemoteSyncDependencyFailure[],
): boolean =>
  failures.some((failure) =>
    failure.dependencies.some(
      (dependency) => dependency.remedy.type === "library",
    ),
  );

// A `none` remedy leaves nothing to switch on, so the content has to move instead.
const requiresContentMove = (
  failures: RemoteSyncDependencyFailure[],
): boolean =>
  failures.some((failure) =>
    failure.dependencies.some(
      (dependency) => dependency.remedy.type === "none",
    ),
  );

export const getBlockedMessage = (
  failures: RemoteSyncDependencyFailure[],
): string => {
  switch (getBlockedReason(failures)) {
    case "personal-content":
      return t`Dashboards or questions in this collection rely on content saved in a personal collection, which can’t be synced. Move that content to a shared collection to continue.`;
    case "unsyncable-content":
      return t`Dashboards or questions in this collection rely on content that can’t be synced where it currently lives. Move that content into a collection you’re syncing to continue.`;
    case "library-missing":
      return t`Dashboards or questions in this collection rely on snippets, which sync with the Library. Create the Library in Data Studio, then sync it to continue.`;
    case "linked-collections":
      return t`Dashboards or questions in this collection rely on data saved elsewhere. To continue, sync those linked collections as well.`;
  }
};

export const buildCollectionMap = (
  collectionTree: Collection[],
): Map<number, Collection> => {
  const map = new Map<number, Collection>();

  const processCollection = (parents: Collection[], collection: Collection) => {
    if (typeof collection.id === "number") {
      map.set(collection.id, { ...collection, effective_ancestors: parents });
    }
    if (collection.children) {
      collection.children.forEach((child) => {
        processCollection([...parents, collection], child);
      });
    }
  };

  collectionTree.forEach((collection) => {
    processCollection([], collection);
  });
  return map;
};

export const getCollectionPathSegments = (
  collectionId: number | undefined,
  collectionMap: Map<number, Collection>,
): CollectionPathSegment[] => {
  if (!collectionId) {
    return [{ id: "root", name: t`Root` }];
  }

  const collection = collectionMap.get(collectionId);
  if (!collection) {
    return [{ id: "root", name: t`Root` }];
  }

  const segments: CollectionPathSegment[] = [];

  if (collection.effective_ancestors) {
    collection.effective_ancestors.forEach((ancestor) => {
      segments.push({ id: ancestor.id, name: ancestor.name });
    });
    segments.push({ id: collection.id, name: collection.name });
    return segments;
  }

  if (collection.effective_location) {
    const locationParts = collection.effective_location
      .split("/")
      .filter(Boolean);

    locationParts.forEach((idStr) => {
      const parentId = parseInt(idStr);
      const parent = collectionMap.get(parentId);
      if (parent) {
        segments.push({ id: parent.id, name: parent.name });
      }
    });
  }

  segments.push({ id: collection.id, name: collection.name });
  return segments;
};
