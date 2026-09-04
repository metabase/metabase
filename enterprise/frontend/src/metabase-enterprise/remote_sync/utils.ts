import { t } from "ttag";

import type { ColorName } from "metabase/ui/colors/types";
import type {
  Collection,
  CollectionType,
  IconName,
  RemoteSyncEntityStatus,
  RemoteSyncRequiredSync,
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

export const ROOT_COLLECTION_ROW_ID = "root";

export type RequiredSyncRow = {
  key: string;
  name: string;
  type: CollectionType;
  personal: boolean;
  syncableId: number | null;
  collectionId: number | typeof ROOT_COLLECTION_ROW_ID | null;
};

export const getRequiredSyncRow = ({
  remedy,
  syncable,
}: RemoteSyncRequiredSync): RequiredSyncRow => {
  if (remedy.type === "collection") {
    const { id, name, type, personal } = remedy.collection;

    return {
      key: `collection:${id}`,
      name,
      type,
      personal,
      syncableId: syncable ? id : null,
      collectionId: id,
    };
  }

  const unsyncable = { type: null, personal: false, syncableId: null };

  if (remedy.type === "library") {
    return {
      ...unsyncable,
      key: "library",
      name: t`Library`,
      collectionId: null,
    };
  }
  if (remedy.collection === null) {
    return {
      ...unsyncable,
      key: ROOT_COLLECTION_ROW_ID,
      name: t`Our analytics`,
      collectionId: ROOT_COLLECTION_ROW_ID,
    };
  }
  if (remedy.collection === undefined) {
    return {
      ...unsyncable,
      key: "unresolved",
      name: t`Unknown collection`,
      collectionId: null,
    };
  }
  return {
    ...unsyncable,
    key: `none:${remedy.collection.id}`,
    name: remedy.collection.name,
    collectionId: remedy.collection.id,
  };
};

/**
 * The entries the modal lists, in the order it lists them. A missing Library has no row to offer —
 * the message covers it — so it is described rather than listed. What can't be synced sorts first:
 * it needs content moved, and nothing switched on below it helps until that is done.
 */
export const getListedRequiredSyncs = (
  required: RemoteSyncRequiredSync[],
): RemoteSyncRequiredSync[] =>
  required
    .filter(({ remedy }) => remedy.type !== "library")
    // Stable, so entries keep the order the backend found them in within each group.
    .sort((a, b) => Number(a.syncable) - Number(b.syncable));

export type BlockedReason =
  | "personal-content"
  | "unsyncable-content"
  | "library-missing"
  | "linked-collections";

// Ordered so content that can't be synced at all outranks content that can.
export const getBlockedReason = (
  required: RemoteSyncRequiredSync[],
): BlockedReason => {
  if (isBlockedByPersonalContent(required)) {
    return "personal-content";
  }
  if (requiresContentMove(required)) {
    return "unsyncable-content";
  }
  if (isBlockedByMissingLibrary(required)) {
    return "library-missing";
  }
  return "linked-collections";
};

// `personal` sits on the remedy — the top-level ancestor — not the collection the dependency is in.
const isBlockedByPersonalContent = (
  required: RemoteSyncRequiredSync[],
): boolean =>
  required.some(
    ({ remedy }) => remedy.type === "collection" && remedy.collection.personal,
  );

// A `library` remedy is the backend saying this instance has no Library at all — once one exists a
// snippet points at it as an ordinary collection remedy, like anything else.
const isBlockedByMissingLibrary = (
  required: RemoteSyncRequiredSync[],
): boolean => required.some(({ remedy }) => remedy.type === "library");

// A `none` remedy leaves nothing to switch on, so the content has to move instead.
const requiresContentMove = (required: RemoteSyncRequiredSync[]): boolean =>
  required.some(({ remedy }) => remedy.type === "none");

export const getBlockedMessage = (
  required: RemoteSyncRequiredSync[],
): string => {
  switch (getBlockedReason(required)) {
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
