import { useMemo } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import { useMetadataProvider } from "metabase/metadata-store";
import type { ConcreteTableId, Table } from "metabase-types/api";

import { getPersonColumn, getUsersTableLink } from "./analyses/column-roles";
import { getColumnRoles } from "./analyses/common-settings";
import { getAnalysisConfig } from "./analyses/config";
import type {
  AnalysisContext,
  AnalysisSettingsByKind,
  UsersTable,
} from "./analyses/types";
import type { BaseQueryInput } from "./base-query";
import { createFlagAllocator } from "./events/allocate-flags";
import { detectPageviews } from "./events/pageviews";
import { computeSettings, getSettingWidgets } from "./settings/compute";
import type { StoredSettings } from "./settings/types";
import type { AnalysisKind } from "./spec/types";
import { useAnalysisQuery } from "./use-analysis-query";
import { useStableValue } from "./use-stable-value";

type UseAnalysisArgs<K extends AnalysisKind> = {
  kind: K;
  tableId: ConcreteTableId | undefined;
  stored: StoredSettings;
  onChangeSettings: (changes: Partial<AnalysisSettingsByKind[K]>) => void;
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
}: UseAnalysisArgs<K>) => {
  const config = getAnalysisConfig(kind);
  const tableMetadata = useGetTableQueryMetadataQuery(
    tableId !== undefined ? { id: tableId } : skipToken,
  );
  const table = tableMetadata.currentData;
  const usersTable = useUsersTable(table, stored);
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  // Memoized: a new query each render would get new clause ids, and with
  // them a new base query.
  const detectedPageviews = useMemo(
    () => detectPageviews(metadataProvider, table),
    [metadataProvider, table],
  );

  const context = useMemo<AnalysisContext>(
    () => ({ table, usersTable, detectedPageviews }),
    [table, usersTable, detectedPageviews],
  );
  const computed = useMemo(
    () => computeSettings(config.settings, context, stored),
    [config, context, stored],
  );
  const widgets = useMemo(
    () =>
      getSettingWidgets(
        config.settings,
        context,
        stored,
        computed,
        onChangeSettings,
      ),
    [config, context, stored, computed, onChangeSettings],
  );

  const flags = createFlagAllocator();
  const specResult = config.toSpec(computed, flags);
  // After `toSpec`, which gives a flag to each event it uses.
  const base = useStableValue<BaseQueryInput>({
    dateRange: computed.date_range,
    columns: getColumnRoles(computed),
    events: flags.events,
    extraColumns: config.getExtraColumns?.(computed, context) ?? [],
    usersTable: usersTable?.link,
    filters: computed.filters,
  });
  const spec = specResult.status === "ready" ? specResult.spec : undefined;
  const missing = specResult.status === "incomplete" ? specResult.missing : [];
  const query = useAnalysisQuery({ spec, tableId, base });

  return {
    config,
    table,
    usersTable,
    context,
    computed,
    base,
    widgets,
    spec,
    missing,
    display: config.getDisplay(computed),
    vizSettings: config.getVizSettings(computed),
    query,
  };
};
