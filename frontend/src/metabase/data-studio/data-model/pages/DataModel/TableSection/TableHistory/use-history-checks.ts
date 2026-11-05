import { useMemo } from "react";
import { msgid, ngettext } from "ttag";

import {
  type HistoryBinding,
  type HistoryCheckId,
  type HistoryProfile,
  type HistoryVersion,
  useHistoryReviewStatus,
  useTableStructures,
} from "metabase/metadata/table-structure";
import {
  type CheckResult,
  HISTORY_CHECK_ID,
  type HistoryChecksInput,
  getGeneratedChecks,
} from "metabase/metadata/table-structure/generated-checks";
import type { Table } from "metabase-types/api";

import { getFieldName, toTableRef } from "../CustomProperties/binding-columns";

import { countOf, getCheckDescription, getEntityNoun } from "./history-labels";

const CONTIGUOUS_MAX_GAP_SHARE = 0.1;

const failing = (summaries: string[]): CheckResult =>
  summaries.length > 0
    ? { status: "failing", summary: summaries.join(" ") }
    : { status: "passing" };

function isContiguous(profile: HistoryProfile) {
  const gapCount =
    profile.checks.find((check) => check.id === "gap")?.entityKeys.length ?? 0;
  return gapCount <= profile.entityCount * CONTIGUOUS_MAX_GAP_SHARE;
}

function hasTiedVersions(versions: HistoryVersion[]) {
  const starts = versions.flatMap(({ validFrom }) =>
    validFrom != null ? [validFrom] : [],
  );
  return new Set(starts).size < starts.length;
}

function getChecksInput(
  table: Table,
  binding: HistoryBinding,
  profile: HistoryProfile,
): HistoryChecksInput | null {
  const fields = table.fields;
  const entityKey = getFieldName(fields, binding.durableKeyFieldId);
  const validFrom = getFieldName(fields, binding.validFromFieldId);
  if (entityKey == null || validFrom == null) {
    return null;
  }
  return {
    table: toTableRef(table),
    columns: {
      entityKey,
      validFrom,
      validTo: getFieldName(fields, binding.validToFieldId),
      currentFlag: getFieldName(fields, binding.currentFlagFieldId),
      version: getFieldName(fields, binding.versionFieldId),
    },
    isContiguous: isContiguous(profile),
  };
}

function getResults(profile: HistoryProfile, input: HistoryChecksInput) {
  const noun = getEntityNoun(profile.durableKeyField);
  const describe = (ids: HistoryCheckId[]) =>
    profile.checks
      .filter((check) => ids.includes(check.id) && check.status !== "passed")
      .map((check) => getCheckDescription(check, profile, noun));
  const versions = profile.entities.flatMap((entity) => entity.versions);
  const keylessCount =
    profile.entities.find((entity) => entity.key === "")?.versions.length ?? 0;
  const mismatchedKeys = profile.entities
    .filter((entity) =>
      entity.versions.some((version) => version.isCurrent !== version.isOpen),
    )
    .map((entity) => entity.key);
  const keyName = profile.durableKeyField.display_name;
  const tiedKeys = profile.entities
    .filter((entity) => hasTiedVersions(entity.versions))
    .map((entity) => entity.key);

  return new Map<string, CheckResult>([
    [
      HISTORY_CHECK_ID.keyNotNull,
      failing(
        keylessCount > 0
          ? [
              ngettext(
                msgid`${keylessCount} of ${versions.length} versions has no ${keyName}.`,
                `${keylessCount} of ${versions.length} versions have no ${keyName}.`,
                keylessCount,
              ),
            ]
          : [],
      ),
    ],
    [HISTORY_CHECK_ID.oneCurrent, failing(describe(["one-current"]))],
    [
      HISTORY_CHECK_ID.ranges,
      failing(describe(input.isContiguous ? ["overlap", "gap"] : ["overlap"])),
    ],
    [HISTORY_CHECK_ID.validRange, failing(describe(["valid-range"]))],
    [
      HISTORY_CHECK_ID.currentIsOpen,
      failing(
        mismatchedKeys.length > 0
          ? [
              ngettext(
                msgid`${countOf(mismatchedKeys.length, noun)} has a current flag that doesn't match its valid to.`,
                `${countOf(mismatchedKeys.length, noun)} have a current flag that doesn't match their valid to.`,
                mismatchedKeys.length,
              ),
            ]
          : [],
      ),
    ],
    [HISTORY_CHECK_ID.versionOrder, failing(describe(["version-order"]))],
    [
      HISTORY_CHECK_ID.oneVersionPerTime,
      failing(
        tiedKeys.length > 0
          ? [
              ngettext(
                msgid`${countOf(tiedKeys.length, noun)} has two versions with the same ${input.columns.validFrom}.`,
                `${countOf(tiedKeys.length, noun)} have two versions with the same ${input.columns.validFrom}.`,
                tiedKeys.length,
              ),
            ]
          : [],
      ),
    ],
  ]);
}

export function useHistoryChecks(table: Table) {
  const status = useHistoryReviewStatus(table);
  const structure = useTableStructures().getTableStructure(table);
  const profile =
    status?.profileState.status === "loaded"
      ? status.profileState.profile
      : null;

  return useMemo(() => {
    if (profile == null) {
      return null;
    }
    const input = getChecksInput(table, structure.history, profile);
    if (input == null) {
      return null;
    }
    const checks = getGeneratedChecks({ structure, history: input });
    return {
      tableRef: input.table,
      checks,
      results: getResults(profile, input),
    };
  }, [table, structure, profile]);
}
