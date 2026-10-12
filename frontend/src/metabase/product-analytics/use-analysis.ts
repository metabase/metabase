import { useMemo } from "react";
import _ from "underscore";

import { skipToken, useGetTableQueryMetadataQuery } from "metabase/api";
import type { ConcreteTableId } from "metabase-types/api";

import { getColumnRoles } from "./analyses/common-settings";
import { getAnalysisConfig } from "./analyses/config";
import type { AnalysisContext, AnalysisSettingsByKind } from "./analyses/types";
import type { BaseQueryInput } from "./base-query";
import { allocateFlags } from "./events/allocate-flags";
import { SAVED_EVENTS } from "./events/catalog";
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
 * the settings, their widgets, the spec, and the query results.
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

  const context = useMemo<AnalysisContext>(
    () => ({ table, savedEvents: SAVED_EVENTS }),
    [table],
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

  const eventIds = _.uniq(config.getEventRefs(computed).map(({ id }) => id));
  const allocation = allocateFlags(eventIds, context.savedEvents);
  const base = useStableValue<BaseQueryInput>({
    dateRange: computed.date_range,
    columns: getColumnRoles(computed),
    events: allocation.events,
  });
  const spec = config.toSpec(computed, allocation);
  const query = useAnalysisQuery({ spec, tableId, base });

  return {
    config,
    table,
    computed,
    widgets,
    spec,
    display: config.getDisplay(computed),
    vizSettings: config.getVizSettings(computed),
    query,
  };
};
