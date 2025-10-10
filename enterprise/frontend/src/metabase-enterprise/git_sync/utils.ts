import { t } from "ttag";

import { getCollectionPathAsString } from "metabase/collections/utils";
import type { IconName } from "metabase/ui";
import type { Collection, CollectionId } from "metabase-types/api";

import type { DirtyEntity } from "../api/git-sync";

export type CollectionPathSegment = {
  id: CollectionId;
  name: string;
};

type SyncStatus = DirtyEntity["sync_status"];

type ErrorData = {
  message?: string;
  conflict?: boolean;
};

export type ExportError = {
  data?: ErrorData;
  message?: string;
};

type ParsedError = {
  errorMessage: string | null;
  hasConflict: boolean;
};

export const getSyncStatusIcon = (status: SyncStatus): IconName => {
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

export const getSyncStatusColor = (status: SyncStatus): string => {
  switch (status) {
    case "create":
      return "var(--mb-base-color-palm-50)";
    case "removed":
    case "delete":
      return "var(--mb-base-color-lobster-50)";
    case "update":
    case "touch":
      return "var(--mb-base-color-blue-50)";
    default:
      return "var(--mb-base-color-orion-50)";
  }
};

const isValidErrorData = (data: unknown): data is ErrorData =>
  typeof data === "object" && data !== null;

const hasConflictProperty = (data: ErrorData): boolean =>
  "conflict" in data && Boolean(data.conflict);

const getErrorMessage = (data: ErrorData): string | undefined =>
  "message" in data && typeof data.message === "string"
    ? data.message
    : undefined;

export const parseExportError = (
  exportError: ExportError | null,
): ParsedError => {
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

export const getCollectionFullPath = (
  collectionId: number | undefined,
  collectionMap: Map<number, Collection>,
): string => {
  if (!collectionId) {
    return t`Root`;
  }

  const collection = collectionMap.get(collectionId);
  if (!collection) {
    return t`Root`;
  }

  if (collection.effective_ancestors) {
    return getCollectionPathAsString(collection);
  }

  if (collection.location) {
    const locationParts = collection.location.split("/").filter(Boolean);
    const pathParts: string[] = [];

    locationParts.forEach((idStr) => {
      const parentId = parseInt(idStr);
      const parent = collectionMap.get(parentId);
      if (parent) {
        pathParts.push(parent.name);
      }
    });

    pathParts.push(collection.name);
    return pathParts.join(" / ");
  }

  return collection.name;
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

  if (collection.location) {
    const locationParts = collection.location.split("/").filter(Boolean);

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
