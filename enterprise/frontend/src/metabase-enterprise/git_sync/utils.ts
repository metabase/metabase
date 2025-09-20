import { t } from "ttag";

import type { IconName } from "metabase/ui";

import type { DirtyEntity } from "../api/git-sync";

type SyncStatus = DirtyEntity["sync_status"];

type ErrorData = {
  message?: string;
  conflict?: boolean;
};

type ExportError = {
  data?: ErrorData;
  message?: string;
};

type ParsedError = {
  errorMessage: string | null;
  hasConflict: boolean;
};

export const getSyncStatusLabel = (status: SyncStatus): string => {
  switch (status) {
    case "create":
      return t`New`;
    case "delete":
      return t`Removed`;
    case "update":
      return t`Changed`;
    case "touch":
      return t`Modified`;
    default:
      return status;
  }
};

export const getSyncStatusIcon = (status: SyncStatus): IconName => {
  switch (status) {
    case "create":
      return "add";
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
      return "success";
    case "delete":
      return "error";
    case "update":
    case "touch":
      return "brand";
    default:
      return "text-medium";
  }
};

export const groupEntitiesBySyncStatus = (
  entities: DirtyEntity[],
): Record<SyncStatus, DirtyEntity[]> =>
  entities.reduce(
    (acc, entity) => {
      const status = entity.sync_status;
      if (!acc[status]) {
        acc[status] = [];
      }
      acc[status].push(entity);
      return acc;
    },
    {} as Record<SyncStatus, DirtyEntity[]>,
  );

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
