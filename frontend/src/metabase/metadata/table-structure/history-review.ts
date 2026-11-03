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
import {
  type AttributeScdType,
  type ScdType,
  isAttributeScdType,
} from "./history-source";
import type { HistoryBinding } from "./inference";
import { isRoleA } from "./roles";
import { type TableStructure, useTableStructures } from "./table-structure";

type TableReview = {
  attributeScdTypes: Record<string, AttributeScdType>;
  confirmedDefinition?: string;
  confirmedAt?: string;
};

type HistoryReviewStorage = Record<string, TableReview>;

export type AttributeScdTypeState = {
  attributeScdType: AttributeScdType;
  isOverridden: boolean;
  suggestion: AttributeScdTypeSuggestion;
};

export type HistoryReviewStatus = {
  needsReview: boolean;
  isConfirmed: boolean;
  confirmedAt: string | null;
  issue: string | null;
  profileState: HistoryProfileState;
};

const STORAGE_KEY = "metabase-prototype-history-review";
const EMPTY_REVIEW: TableReview = { attributeScdTypes: {} };

function parseTableReview(value: unknown): TableReview {
  if (!isObject(value)) {
    return EMPTY_REVIEW;
  }
  const attributeScdTypes = isObject(value.attributeScdTypes)
    ? Object.fromEntries(
        Object.entries(value.attributeScdTypes).filter(
          (entry): entry is [string, AttributeScdType] =>
            isAttributeScdType(entry[1]),
        ),
      )
    : {};
  return {
    attributeScdTypes,
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

const CORRECTION_SEMANTIC_TYPES = new Set(["type/Name", "type/Email"]);
const CORRECTION_CHANGE_SHARE = 0.1;

export type AttributeScdTypeSuggestion = {
  attributeScdType: AttributeScdType;
  reason: string;
};

export function suggestAttributeScdType(
  field: Pick<Field, "semantic_type">,
  column: Pick<ColumnChangeProfile, "changeCount" | "changedEntityCount">,
  entityCount: number,
): AttributeScdTypeSuggestion {
  if (column.changeCount === 0) {
    return { attributeScdType: 0, reason: t`never changes` };
  }
  const changedShare = column.changedEntityCount / Math.max(1, entityCount);
  const looksLikeCorrection =
    field.semantic_type != null &&
    CORRECTION_SEMANTIC_TYPES.has(field.semantic_type) &&
    changedShare < CORRECTION_CHANGE_SHARE;
  return looksLikeCorrection
    ? {
        attributeScdType: 1,
        reason: t`a name that rarely changes, so changes are likely corrections`,
      }
    : { attributeScdType: 2, reason: t`changes between versions` };
}

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

  const getAttributeScdType = (
    field: Field,
    column: ColumnChangeProfile | undefined,
    entityCount: number,
  ): AttributeScdTypeState => {
    const override =
      review.attributeScdTypes[String(getRawTableFieldId(field))];
    const suggestion = suggestAttributeScdType(
      field,
      column ?? { changeCount: 0, changedEntityCount: 0 },
      entityCount,
    );
    return {
      attributeScdType: override ?? suggestion.attributeScdType,
      isOverridden: override != null,
      suggestion,
    };
  };

  const setAttributeScdType = useCallback(
    (fieldId: FieldId, attributeScdType: AttributeScdType | null) =>
      updateReview((current) => ({
        ...current,
        attributeScdTypes:
          attributeScdType == null
            ? _.omit(current.attributeScdTypes, String(fieldId))
            : {
                ...current.attributeScdTypes,
                [String(fieldId)]: attributeScdType,
              },
      })),
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
    getAttributeScdType,
    setAttributeScdType,
    confirm,
  };
}

function getIssue(
  structure: TableStructure,
  profileState: HistoryProfileState,
): string | null {
  if (profileState.status === "unbound") {
    return t`Pick the durable key and valid from columns`;
  }
  if (structure.scdType == null) {
    return t`Pick an SCD type`;
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
  return isWeakGuess
    ? t`SCD type is a guess: ${structure.scdTypeInference.signal}`
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
