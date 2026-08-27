import { match } from "ts-pattern";
import { t } from "ttag";

import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import { getObjectKeys } from "metabase/utils/objects";
import type {
  RequestableIndexes,
  TableIndexEntry,
  TableIndexRequestStatus,
} from "metabase-types/api";

export function getKindLabels(
  requestableIndexes: RequestableIndexes | null | undefined,
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const kind of getObjectKeys(requestableIndexes ?? {})) {
    labels.set(kind, requestableIndexes?.[kind]?.["display-name"] ?? kind);
  }
  return labels;
}

export function getIndexName(index: TableIndexEntry): string {
  return index.name ?? index.kind;
}

export function getIndexKey(index: TableIndexEntry, position: number): string {
  if (index.request?.id !== undefined) {
    return `request-${index.request.id}`;
  }

  return `index-${getIndexName(index)}-${position}`;
}

export function isManagedIndex(index: TableIndexEntry): boolean {
  return index.metabase_managed && index.request?.id !== undefined;
}

export function isPendingDeletion(index: TableIndexEntry): boolean {
  return index.request?.status === "delete-pending";
}

export function isPendingStatus(
  status: TableIndexRequestStatus | undefined,
): boolean {
  return (
    status === "create-pending" ||
    status === "update-pending" ||
    status === "delete-pending"
  );
}

export function formatStatus(
  status: TableIndexRequestStatus | undefined,
): string {
  if (status === undefined) {
    return EMPTY_CELL_PLACEHOLDER;
  }

  return match(status)
    .with("create-pending", "update-pending", () => t`Pending`)
    .with("delete-pending", () => t`Removing`)
    .with("running", () => t`Running`)
    .with("succeeded", () => t`Succeeded`)
    .with("failed", () => t`Failed`)
    .exhaustive();
}
