import { useCallback, useMemo } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import {
  type StoredSettings,
  type UsersTableLink,
  computeSettings,
  getEventTableSettings,
  getSettingWidgets,
  getUsersTableLink,
  isEventTableSetUp,
} from "metabase/event-tables";
import type { ConcreteTableId, Table } from "metabase-types/api";

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

// PROTOTYPE: the analyses' SQL is ClickHouse's. Lift this once it's MBQL.
const SUPPORTED_ENGINE = "clickhouse";

type UseAnalysisArgs<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  stored: StoredSettings;
  onChangeSettings: (changes: Partial<AnalysisSettingsByKind[K]>) => void;
  /** Colors picked in the display panel. */
  colors: DisplayColors;
};

/**
 * The link to the people table, known with the event table, and the people
 * table once its metadata is loaded too.
 */
const useUsersTable = (
  table: Table | undefined,
): { link: UsersTableLink | undefined; usersTable: UsersTable | undefined } => {
  const link = useMemo(
    () =>
      getUsersTableLink(table, getEventTableSettings(table)["columns.person"]),
    [table],
  );
  const metadata = useGetTableQueryMetadataQuery(
    link !== undefined ? { id: link.tableId } : skipToken,
  );
  const usersTableMetadata = metadata.currentData;
  const usersTable = useMemo(
    () =>
      link !== undefined && usersTableMetadata !== undefined
        ? { link, table: usersTableMetadata }
        : undefined,
    [link, usersTableMetadata],
  );
  return { link, usersTable };
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
  const { link: usersTableLink, usersTable } = useUsersTable(table);

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

  // The same test as the table picker's, so a table that's left the picker,
  // like one that's no longer an event table, asks to be set up again. Until
  // the table loads, it isn't known not to be set up.
  const isTableSetUp = table === undefined || isEventTableSetUp(table);
  // Until the table loads, its database isn't known to be unsupported.
  const isDatabaseSupported =
    table === undefined || table.db?.engine === SUPPORTED_ENGINE;
  const flags = createFlagAllocator();
  const specResult = config.toSpec(computed, flags);
  const spec =
    specResult.status === "ready" && isTableSetUp && isDatabaseSupported
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
    /** While the people table loads, `usersTable` is undefined but this isn't. */
    usersTableLink,
    computed,
    widgets,
    spec,
    missing,
    isTableSetUp,
    isDatabaseSupported,
    display: config.getDisplay(computed),
    question: config.getQuestion?.(computed) ?? config.question,
    vizSettings: config.getVizSettings(computed, colors),
    colorSlots: config.getColorSlots?.(computed, colors) ?? [],
    query,
  };
};
