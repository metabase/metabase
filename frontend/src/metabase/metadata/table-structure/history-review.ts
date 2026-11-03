import { useCallback } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import { getRawTableFieldId } from "metabase/metadata/utils/field";
import type { Field, FieldId, Table } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import {
  type HistoryProfileState,
  getFailedChecks,
  useHistoryProfile,
} from "./history-profile";
import type { ScdType } from "./history-source";
import type { HistoryBinding } from "./inference";
import { isRoleA } from "./roles";
import { type TableStructure, useTableStructures } from "./table-structure";

type TableReview = {
  correctionFieldIds: string[];
  confirmedDefinition?: string;
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
const EMPTY_REVIEW: TableReview = { correctionFieldIds: [] };

function parseTableReview(value: unknown): TableReview {
  if (!isObject(value)) {
    return EMPTY_REVIEW;
  }
  const correctionFieldIds = Array.isArray(value.correctionFieldIds)
    ? value.correctionFieldIds.filter((id) => typeof id === "string")
    : [];
  return {
    correctionFieldIds,
    confirmedDefinition:
      typeof value.confirmedDefinition === "string"
        ? value.confirmedDefinition
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

const getDefinitionKey = (binding: HistoryBinding, scdType: ScdType | null) =>
  JSON.stringify({ ..._.omit(binding, "currentRowsOnly"), scdType });

export function useHistoryReview(table: Pick<Table, "db_id" | "id">) {
  const [storage, updateStorage] = usePrototypeStorage(
    STORAGE_KEY,
    parseStorage,
  );
  const tableKey = getTableKey(table);
  const review = storage[tableKey] ?? EMPTY_REVIEW;

  const updateReview = useCallback(
    (update: (review: TableReview) => TableReview) =>
      updateStorage((current) => ({
        ...current,
        [tableKey]: update(current[tableKey] ?? EMPTY_REVIEW),
      })),
    [tableKey, updateStorage],
  );

  const isCorrectionField = (field: Field) =>
    review.correctionFieldIds.includes(String(getRawTableFieldId(field)));

  const setCorrectionField = useCallback(
    (fieldId: FieldId, isCorrection: boolean) =>
      updateReview((current) => {
        const others = current.correctionFieldIds.filter(
          (id) => id !== String(fieldId),
        );
        return {
          ...current,
          correctionFieldIds: isCorrection
            ? [...others, String(fieldId)]
            : others,
        };
      }),
    [updateReview],
  );

  const confirm = useCallback(
    (structure: Pick<TableStructure, "history" | "scdType">) =>
      updateReview((current) => ({
        ...current,
        confirmedDefinition: getDefinitionKey(
          structure.history,
          structure.scdType,
        ),
        confirmedAt: new Date().toISOString(),
      })),
    [updateReview],
  );

  const isConfirmed = (
    structure: Pick<TableStructure, "history" | "scdType">,
  ) =>
    review.confirmedDefinition ===
    getDefinitionKey(structure.history, structure.scdType);

  return {
    confirmedAt: review.confirmedAt ?? null,
    isConfirmed,
    isCorrectionField,
    setCorrectionField,
    confirm,
  };
}

function getIssue(
  structure: TableStructure,
  profileState: HistoryProfileState,
): string | null {
  if (profileState.status === "unbound") {
    return t`Pick the entity key and valid from columns`;
  }
  if (structure.scdType == null) {
    return t`Say how this table keeps history`;
  }
  if (profileState.status !== "loaded") {
    return null;
  }
  const failedCount = getFailedChecks(profileState.profile).length;
  if (failedCount > 0) {
    return ngettext(
      msgid`${failedCount} history check fails`,
      `${failedCount} history checks fail`,
      failedCount,
    );
  }
  const isWeakGuess =
    !structure.isScdTypeOverridden &&
    structure.scdTypeInference.confidence === "low";
  return isWeakGuess ? t`Recognized from a weak signal` : null;
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
  const issue = getIssue(structure, profileState);
  const isDefinitionConfirmed = isConfirmed(structure);
  return {
    needsReview: issue != null && !isDefinitionConfirmed,
    isConfirmed: isDefinitionConfirmed,
    confirmedAt: isDefinitionConfirmed ? confirmedAt : null,
    issue,
    profileState,
  };
}
