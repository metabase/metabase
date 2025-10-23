import { t } from "ttag";

import type { IconName } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  RemoteSyncEntityStatus,
} from "metabase-types/api";

export type CollectionPathSegment = {
  id: CollectionId;
  name: string;
};

type ErrorData = {
  message?: string;
  conflicts?: boolean;
};

export type SyncError = {
  data?: ErrorData;
  message?: string;
};

type ParsedError = {
  errorMessage: string | null;
  hasConflict: boolean;
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

export const getSyncStatusColor = (status: RemoteSyncEntityStatus): string => {
  switch (status) {
    case "create":
      return "var(--mb-color-success)";
    case "removed":
    case "delete":
      return "var(--mb-color-danger)";
    case "update":
    case "touch":
      return "var(--mb-color-saturated-blue)";
    default:
      return "var(--mb-color-info)";
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
    return { errorMessage: null, hasConflict: false };
  }

  if (
    "data" in exportError &&
    exportError.data &&
    isValidErrorData(exportError.data)
  ) {
    const errorData = exportError.data;
    const messageFromData = getErrorMessage(errorData);
    const hasConflict = hasConflictProperty(errorData);

    if (hasConflict) {
      return {
        errorMessage:
          messageFromData ||
          t`Your changes conflict with the remote repository. You can force push to override them.`,
        hasConflict: true,
      };
    }

    return {
      errorMessage:
        messageFromData || t`Something went wrong. Please try again.`,
      hasConflict: false,
    };
  }

  if ("message" in exportError && typeof exportError.message === "string") {
    return {
      errorMessage:
        exportError.message || t`Something went wrong. Please try again.`,
      hasConflict: false,
    };
  }

  return {
    errorMessage: t`Something went wrong. Please try again.`,
    hasConflict: false,
  };
};

export const buildCollectionMap = (
  collectionTree: Collection[],
): Map<number, Collection> => {
  const map = new Map<number, Collection>();

  const processCollection = (collection: Collection) => {
    if (typeof collection.id === "number") {
      map.set(collection.id, collection);
    }
    if (collection.children) {
      collection.children.forEach(processCollection);
    }
  };

  collectionTree.forEach(processCollection);
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
