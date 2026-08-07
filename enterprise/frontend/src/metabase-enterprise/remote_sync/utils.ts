import { t } from "ttag";

import type { ColorName } from "metabase/ui/colors/types";
import type {
  Collection,
  IconName,
  RemoteSyncCollectionRef,
  RemoteSyncDependencyFailure,
  RemoteSyncEntityStatus,
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

/**
 * The collections we asked to sync that the backend refused. One entry per collection — the backend
 * reports every offending collection in a single pass, so these are already unique.
 */
export const getBlockedCollections = (
  failures: RemoteSyncDependencyFailure[],
): RemoteSyncCollectionRef[] => failures.map((failure) => failure.collection);

/** [[getBlockedCollections]] reduced to an id set, for per-row lookup in a collection list. */
export const getBlockedCollectionIds = (
  failures: RemoteSyncDependencyFailure[],
): Set<number> =>
  new Set(getBlockedCollections(failures).map((collection) => collection.id));

/**
 * Every collection that would also have to be synced for the save to go through, deduped — remedies
 * point at top-level collections, so many dependencies collapse onto the same one. Snippet
 * dependencies ask for the Library instead, which `requiresLibrarySync` reports separately.
 */
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

/** [[getRequiredCollections]] reduced to an id set, for per-row lookup in a collection list. */
export const getRequiredCollectionIds = (
  failures: RemoteSyncDependencyFailure[],
): Set<number> =>
  new Set(getRequiredCollections(failures).map((collection) => collection.id));

/**
 * Blocked collections that can't be unblocked from this screen, because at least one dependency
 * resolves to a personal collection. `personal` sits on the remedy — the top-level ancestor — not on
 * the collection the dependency itself lives in, which may be a sub-collection of it.
 */
export const getCollectionIdsBlockedByPersonalContent = (
  failures: RemoteSyncDependencyFailure[],
): Set<number> =>
  new Set(
    failures
      .filter((failure) =>
        failure.dependencies.some(
          (dependency) =>
            dependency.remedy.type === "collection" &&
            dependency.remedy.collection.personal,
        ),
      )
      .map((failure) => failure.collection.id),
  );

/** Whether any dependency needs the Library synced — snippets key on it, not on their collection. */
export const requiresLibrarySync = (
  failures: RemoteSyncDependencyFailure[],
): boolean =>
  failures.some((failure) =>
    failure.dependencies.some(
      (dependency) => dependency.remedy.type === "library",
    ),
  );

/** Which situation the admin is actually in, and so what we can offer them. */
export type BlockedReason =
  | "personal-content"
  | "library"
  | "linked-collections";

/**
 * Ordered by how much each situation constrains the admin: content they can't sync at all outranks
 * content they can, so we never tell them to fix something that wouldn't be enough on its own.
 */
export const getBlockedReason = (
  failures: RemoteSyncDependencyFailure[],
): BlockedReason => {
  if (getCollectionIdsBlockedByPersonalContent(failures).size > 0) {
    return "personal-content";
  }
  if (requiresLibrarySync(failures)) {
    return "library";
  }
  return "linked-collections";
};

/** What to tell the admin about the refused save, per [[getBlockedReason]]. */
export const getBlockedMessage = (
  failures: RemoteSyncDependencyFailure[],
): string => {
  switch (getBlockedReason(failures)) {
    case "personal-content":
      return t`Dashboards or questions in this collection rely on content saved in a personal collection, which can’t be synced. Move that content to a shared collection to continue.`;
    case "library":
      return t`Dashboards or questions in this collection rely on snippets, which sync with the Library. Sync the Library as well to continue.`;
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
