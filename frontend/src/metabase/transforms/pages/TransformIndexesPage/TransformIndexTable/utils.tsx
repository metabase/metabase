import { match } from "ts-pattern";
import { t } from "ttag";

import { EMPTY_CELL_PLACEHOLDER } from "metabase/utils/constants";
import type {
  TableIndexEntry,
  TableIndexRequestStatus,
} from "metabase-types/api";

export function getIndexName(index: TableIndexEntry): string {
  return index.name ?? index.kind;
}

export function getIndexKey(index: TableIndexEntry, position: number): string {
  if (index.request?.id !== undefined) {
    return `request-${index.request.id}`;
  }

  return `index-${getIndexName(index)}-${position}`;
}

export function formatStatus(
  status: TableIndexRequestStatus | undefined,
): string {
  return match(status)
    .with("pending", () => t`Pending`)
    .with("running", () => t`Running`)
    .with("succeeded", () => t`Succeeded`)
    .with("failed", () => t`Failed`)
    .with("dropped", () => t`Dropped`)
    .otherwise(() => EMPTY_CELL_PLACEHOLDER);
}
