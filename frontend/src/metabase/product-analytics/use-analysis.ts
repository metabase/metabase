import { useCallback, useMemo } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import {
  type StoredSettings,
  computeSettings,
  getMissingColumnRoles,
  getSettingWidgets,
} from "metabase/event-tables";
import type { ConcreteTableId, Table } from "metabase-types/api";

import { getPersonColumn, getUsersTableLink } from "./analyses/column-roles";
import { getColumnRoles } from "./analyses/common-settings";
import { getAnalysisConfig } from "./analyses/config";
import type {
  AnalysisContext,
  AnalysisSettingsByKind,
  DisplayColors,
  UsersTable,
} from "./analyses/types";
import type { BaseQueryInput } from "./base-query";
import { createFlagAllocator } from "./events/allocate-flags";
import type { AnalysisKind } from "./spec/types";
import { getLookbackDays } from "./sql/analyses/lookback";
import { useAnalysisQuery } from "./use-analysis-query";
import { useStableValue } from "./use-stable-value";

type UseAnalysisArgs<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  stored: StoredSettings;
  onChangeSettings: (changes: Partial<AnalysisSettingsByKind[K]>) => void;
  /** Colors picked in the display panel. */
  colors: DisplayColors;
};

/** The table the person column links to, once its metadata is loaded. */
const useUsersTable = (
  table: Table | undefined,
  stored: StoredSettings,
): UsersTable | undefined => {
  const link = useMemo(
    () => getUsersTableLink(table, getPersonColumn(table, stored)),
    [table, stored],
  );
  const metadata = useGetTableQueryMetadataQuery(
    link !== undefined ? { id: link.tableId } : skipToken,
  );
  const usersTable = metadata.currentData;
  return useMemo(
    () =>
      link !== undefined && usersTable !== undefined
        ? { link, table: usersTable }
        : undefined,
    [link, usersTable],
  );
};

/**
 * Runs an analysis from the settings the user changed: computes the rest of
 * the settings, their widgets, the spec, and the query results. While
 * `missing` is non-empty, `spec` is undefined and no query runs.
 */
export const useAnalysis = <K extends AnalysisKind>({
  kind,
  tableId,
  stored,
  onChangeSettings,
  colors,
}: UseAnalysisArgs<K>) => {
  const config = getAnalysisConfig(kind);
  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const table = tableMetadata.currentData;
  const usersTable = useUsersTable(table, stored);

  const context = useMemo<AnalysisContext>(
    () => ({ table, usersTable }),
    [table, usersTable],
  );
  const computed = useMemo(
    () => computeSettings(config.settings, context, stored),
    [config, context, stored],
  );
  // Only the widgets see the picked colors, so picking one doesn't recompute
  // the settings or the query.
  const widgetContext = useMemo<AnalysisContext>(
    () => ({ ...context, displayColors: colors }),
    [context, colors],
  );
  const handleChangeSettings = useCallback(
    (changes: Partial<AnalysisSettingsByKind[K]>) =>
      onChangeSettings({
        ...changes,
        ...config.getFollowingChanges?.(changes, computed),
      }),
    [config, computed, onChangeSettings],
  );
  const widgets = useMemo(
    () =>
      getSettingWidgets(
        config.settings,
        widgetContext,
        stored,
        computed,
        handleChangeSettings,
      ),
    [config, widgetContext, stored, computed, handleChangeSettings],
  );

  // No analysis runs without these, so they're asked for before anything else.
  // Until the table loads, nothing is known to be missing.
  const missingColumnRoles =
    table !== undefined ? getMissingColumnRoles(computed) : [];
  const flags = createFlagAllocator();
  const specResult = config.toSpec(computed, flags);
  const spec =
    specResult.status === "ready" && missingColumnRoles.length === 0
      ? specResult.spec
      : undefined;
  const requiredPeopleSegments = computed.filters.people.map(
    flags.segmentFlagFor,
  );
  // After `toSpec`, which gives a flag to each event it uses.
  const base = useStableValue<BaseQueryInput>({
    dateRange: computed.date_range,
    columns: getColumnRoles(computed),
    pageviews: computed.pageviews,
    pathCleaning: computed.path_cleaning,
    events: flags.events,
    extraColumns: config.getExtraColumns?.(computed, context) ?? [],
    usersTable: usersTable?.link,
    filters: computed.filters,
    peopleSegments: flags.segments,
    requiredPeopleSegments,
    lookbackDays: spec !== undefined ? getLookbackDays(spec) : 0,
  });
  // Until the table loads, its columns aren't known to be missing either.
  const missing =
    specResult.status === "incomplete"
      ? specResult.missing.filter(
          (setting) => table !== undefined || !setting.isTableSetting,
        )
      : [];
  const query = useAnalysisQuery({ spec, tableId, base });

  return {
    config,
    table,
    usersTable,
    computed,
    widgets,
    spec,
    missing,
    missingColumnRoles,
    display: config.getDisplay(computed),
    question: config.getQuestion?.(computed) ?? config.question,
    vizSettings: config.getVizSettings(computed, colors),
    colorSlots: config.getColorSlots?.(computed, colors) ?? [],
    query,
  };
};
