import { useMemo } from "react";

import { skipToken, useGetFieldValuesQuery } from "metabase/api";
import type { Table } from "metabase-types/api";

import type { AnalysisConfig, AnalysisSettingsByKind } from "./analyses/types";
import type { ColumnRole } from "./columns";
import { useTableQuery } from "./components/events/use-table-query";
import type { StoredSettings } from "./settings/types";
import type { AnalysisKind } from "./spec/types";
import { useStableValue } from "./use-stable-value";

const getFieldId = (
  table: Table | undefined,
  columnName: string | null,
): number | undefined => {
  const field = table?.fields?.find((field) => field.name === columnName);
  return typeof field?.id === "number" ? field.id : undefined;
};

/** Field values are `[value]` or `[value, remapped]`; only strings are usable. */
const toStrings = (values: unknown[][] | undefined): string[] =>
  (values ?? []).flatMap(([value]) =>
    typeof value === "string" && value !== "" ? [value] : [],
  );

type UseSuggestedSettingsArgs<K extends AnalysisKind> = {
  config: AnalysisConfig<K>;
  table: Table | undefined;
  computed: AnalysisSettingsByKind[K];
  /** Skips the lookups entirely, e.g. for a saved analysis. */
  enabled: boolean;
};

/**
 * The settings a new analysis should start from, or `undefined` while the
 * table and its field values are still loading, or when the analysis has no
 * suggestion to make. Settles exactly once per table: the value never goes
 * back to `undefined`, and never changes after it's defined.
 */
export const useSuggestedSettings = <K extends AnalysisKind>({
  config,
  table,
  computed,
  enabled,
}: UseSuggestedSettingsArgs<K>): StoredSettings | undefined => {
  const tableQuery = useTableQuery(enabled ? table : undefined);
  const eventNameFieldId = getFieldId(table, computed["columns.event_name"]);
  const urlPathFieldId = getFieldId(table, computed["columns.url_path"]);

  const eventNames = useGetFieldValuesQuery(
    enabled && eventNameFieldId !== undefined ? eventNameFieldId : skipToken,
  );
  const urlPaths = useGetFieldValuesQuery(
    enabled && urlPathFieldId !== undefined ? urlPathFieldId : skipToken,
  );

  const isSettled = [eventNames, urlPaths].every(
    (result) => result.isUninitialized || result.isSuccess || result.isError,
  );

  const valuesByRole = useStableValue<Partial<Record<ColumnRole, string[]>>>({
    event_name: toStrings(eventNames.data?.values),
    url_path: toStrings(urlPaths.data?.values),
  });

  return useMemo(() => {
    if (
      !enabled ||
      table === undefined ||
      tableQuery === undefined ||
      !isSettled ||
      config.getSuggestedSettings === undefined
    ) {
      return undefined;
    }
    return config.getSuggestedSettings(
      { table, tableQuery, valuesByRole },
      computed,
    );
  }, [enabled, table, tableQuery, isSettled, valuesByRole, config, computed]);
};
