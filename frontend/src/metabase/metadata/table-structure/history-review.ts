import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type ColumnChangeProfile,
  type HistoryProfileState,
  getFailedChecks,
  useHistoryProfile,
} from "./history-profile";
import type { HistoryBinding } from "./inference";
import { isRoleA } from "./roles";
import { useTableStructures } from "./table-structure";

export const COLUMN_TREATMENTS = [
  "as-it-was",
  "as-it-was-and-current",
  "always-current",
] as const;

export type ColumnTreatment = (typeof COLUMN_TREATMENTS)[number];

type TableReview = {
  columns: Record<string, ColumnTreatment>;
  confirmedBinding?: string;
  confirmedAt?: string;
};

type HistoryReviewStorage = Record<string, TableReview>;

export type HistoryReviewStatus = {
  needsReview: boolean;
  isConfirmed: boolean;
  confirmedAt: string | null;
  issue: string | null;
  profileState: HistoryProfileState;
};

const STORAGE_KEY = "metabase-prototype-history-review";

const isColumnTreatment = (value: unknown): value is ColumnTreatment =>
  COLUMN_TREATMENTS.some((treatment) => treatment === value);

function parseTableReview(value: unknown): TableReview {
  if (!isObject(value)) {
    return { columns: {} };
  }
  const columns = isObject(value.columns)
    ? Object.fromEntries(
        Object.entries(value.columns).filter(
          (entry): entry is [string, ColumnTreatment] =>
            isColumnTreatment(entry[1]),
        ),
      )
    : {};
  return {
    columns,
    confirmedBinding:
      typeof value.confirmedBinding === "string"
        ? value.confirmedBinding
        : undefined,
    confirmedAt:
      typeof value.confirmedAt === "string" ? value.confirmedAt : undefined,
  };
}

function parseStorage(value: unknown): HistoryReviewStorage {
  return isObject(value) ? _.mapObject(value, parseTableReview) : {};
}

const getTableKey = (table: Pick<Table, "db_id" | "id">) =>
  `${table.db_id}:${table.id}`;

const getBindingKey = (binding: HistoryBinding) =>
  JSON.stringify(_.omit(binding, "currentRowsOnly"));

export function getDefaultColumnTreatment(
  column: ColumnChangeProfile,
): ColumnTreatment | null {
  return column.changeCount > 0 ? "as-it-was" : null;
}

export function useHistoryReview(table: Pick<Table, "db_id" | "id">) {
  const [storage, updateStorage] = usePrototypeStorage(
    STORAGE_KEY,
    parseStorage,
  );
  const tableKey = getTableKey(table);
  const review = storage[tableKey] ?? { columns: {} };

  const updateReview = useCallback(
    (update: (review: TableReview) => TableReview) =>
      updateStorage((current) => ({
        ...current,
        [tableKey]: update(current[tableKey] ?? { columns: {} }),
      })),
    [tableKey, updateStorage],
  );

  const getColumnTreatment = (
    column: ColumnChangeProfile,
  ): ColumnTreatment | null =>
    column.changeCount > 0
      ? (review.columns[String(getRawTableFieldId(column.field))] ??
        getDefaultColumnTreatment(column))
      : null;

  const setColumnTreatment = useCallback(
    (fieldId: FieldId, treatment: ColumnTreatment) =>
      updateReview((current) => ({
        ...current,
        columns: { ...current.columns, [String(fieldId)]: treatment },
      })),
    [updateReview],
  );

  const confirm = useCallback(
    (binding: HistoryBinding) =>
      updateReview((current) => ({
        ...current,
        confirmedBinding: getBindingKey(binding),
        confirmedAt: new Date().toISOString(),
      })),
    [updateReview],
  );

  const isConfirmed = (binding: HistoryBinding) =>
    review.confirmedBinding === getBindingKey(binding);

  return {
    confirmedAt: review.confirmedAt ?? null,
    isConfirmed,
    getColumnTreatment,
    setColumnTreatment,
    confirm,
  };
}

function getIssue(profileState: HistoryProfileState): string | null {
  if (profileState.status === "unbound") {
    return t`Pick the durable key and valid from columns`;
  }
  if (profileState.status !== "loaded") {
    return null;
  }
  const failedCount = getFailedChecks(profileState.profile).length;
  return failedCount > 0
    ? ngettext(
        msgid`${failedCount} history check fails`,
        `${failedCount} history checks fail`,
        failedCount,
      )
    : null;
}

export function useHistoryReviewStatus(
  table: Pick<Table, "db_id" | "id" | "name"> & { fields?: Field[] },
): HistoryReviewStatus | null {
  const { getTableStructure } = useTableStructures();
  const structure = getTableStructure(table);
  const isHistory =
    structure.role != null && isRoleA(structure.role, "role/HistoryDimension");
  const profileState = useHistoryProfile(table, structure.history, {
    skip: !isHistory,
  });
  const { isConfirmed, confirmedAt } = useHistoryReview(table);

  if (!isHistory) {
    return null;
  }
  const issue = getIssue(profileState);
  const isBindingConfirmed = isConfirmed(structure.history);
  return {
    needsReview: issue != null && !isBindingConfirmed,
    isConfirmed: isBindingConfirmed,
    confirmedAt: isBindingConfirmed ? confirmedAt : null,
    issue,
    profileState,
  };
}
