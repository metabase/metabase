import { useMemo } from "react";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import type { ConcreteTableId } from "metabase-types/api";

import { getColumnRoles } from "./analyses/common-settings";
import { getAnalysisConfig } from "./analyses/config";
import type { AnalysisContext, AnalysisSettingsByKind } from "./analyses/types";
import type { BaseQueryInput } from "./base-query";
import { createFlagAllocator } from "./events/allocate-flags";
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

  const context = useMemo<AnalysisContext>(() => ({ table }), [table]);
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
  });
  const spec = specResult.status === "ready" ? specResult.spec : undefined;
  const missing = specResult.status === "incomplete" ? specResult.missing : [];
  const query = useAnalysisQuery({ spec, tableId, base });

  return {
    config,
    table,
    computed,
    widgets,
    spec,
    missing,
    display: config.getDisplay(computed),
    vizSettings: config.getVizSettings(computed),
    query,
  };
};
