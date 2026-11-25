import { useMemo } from "react";

import { skipToken, useGetAdhocQueryQuery } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";
import type {
  CardDisplayType,
  ProductAnalyticsKind,
  RawSeries,
  Table,
  VisualizationSettings,
} from "metabase-types/api";

import { computeAnalysisSettings, getAnalysisConfig } from "./analyses/config";
import type { AnalysisSettingsByKind } from "./analyses/types";
import { getAnalysisState } from "./analysis-state";
import { useStableQuery } from "./use-stable-value";

type Analysis = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
};

type AnalysisBuild<K extends ProductAnalyticsKind> =
  | {
      settings: AnalysisSettingsByKind[K];
      baseQuery: Lib.Query;
      analysis: Analysis;
      query: Lib.Query;
      error?: never;
    }
  | {
      /** Missing when the settings can't be computed. */
      settings?: AnalysisSettingsByKind[K];
      baseQuery?: Lib.Query;
      analysis?: never;
      query?: never;
      error: unknown;
    };

function buildAnalysis<K extends ProductAnalyticsKind>(
  kind: K,
  table: Table,
  storedSettings: Record<string, unknown>,
  metadataProvider: Lib.MetadataProvider,
): AnalysisBuild<K> {
  let settings: AnalysisSettingsByKind[K];
  let baseQuery: Lib.Query;
  try {
    settings = computeAnalysisSettings(
      kind,
      { table, metadataProvider },
      storedSettings,
    );
    baseQuery = Lib.fromJsQuery(metadataProvider, settings.base_query);
  } catch (error) {
    return { error };
  }
  try {
    const config = getAnalysisConfig(kind);
    const analysisState = getAnalysisState({
      kind,
      settings,
      table,
      baseQuery,
    });
    const isDrilled = settings.drill !== null;
    return {
      settings,
      baseQuery,
      analysis: {
        title: config.getTitle(settings),
        display: isDrilled ? "table" : config.getDisplay(settings),
        vizSettings: isDrilled ? {} : config.getVizSettings(settings),
      },
      query: Lib.buildProductAnalyticsQuery(analysisState),
    };
  } catch (error) {
    return { settings, baseQuery, error };
  }
}

type UseAnalysisOptions<K extends ProductAnalyticsKind> = {
  kind: K;
  /** An event table that's set up for product analysis, once it's loaded. */
  table: Table | undefined;
  /** The settings the user changed. Invalid values fall back to defaults. */
  storedSettings: Record<string, unknown>;
};

type UseAnalysisResult<K extends ProductAnalyticsKind> = {
  /** Undefined without a table, and when they can't be computed. */
  settings: AnalysisSettingsByKind[K] | undefined;
  /** The `base_query` setting as a query. Undefined along with `settings`. */
  baseQuery: Lib.Query | undefined;
  /** Undefined without a table, and when the query can't be built. */
  analysis: Analysis | undefined;
  /** The query that runs. It keeps its identity while it's unchanged. */
  query: Lib.Query | undefined;
  rawSeries: RawSeries | null;
  isRunning: boolean;
  /** Why the query couldn't be built, or why its run failed. */
  error: string | undefined;
};

/** Computes the analysis's settings, builds its query, and runs it. */
export const useAnalysis = <K extends ProductAnalyticsKind>({
  kind,
  table,
  storedSettings,
}: UseAnalysisOptions<K>): UseAnalysisResult<K> => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const build = useMemo(
    () =>
      table !== undefined
        ? buildAnalysis(kind, table, storedSettings, metadataProvider)
        : undefined,
    [kind, table, storedSettings, metadataProvider],
  );
  const analysis = build?.analysis;
  const query = useStableQuery(build?.query);
  const datasetQuery = useMemo(
    () => (query !== undefined ? Lib.toJsQuery(query) : undefined),
    [query],
  );
  // `currentData`, not `data`: `data` keeps the previous query's result.
  const {
    currentData: dataset,
    error: requestError,
    isFetching,
  } = useGetAdhocQueryQuery(datasetQuery ?? skipToken);

  const rawSeries = useMemo(
    (): RawSeries | null =>
      analysis !== undefined &&
      datasetQuery !== undefined &&
      dataset?.data !== undefined &&
      dataset.error === undefined
        ? [
            {
              card: {
                name: analysis.title,
                display: analysis.display,
                visualization_settings: analysis.vizSettings,
                dataset_query: datasetQuery,
              },
              data: dataset.data,
            },
          ]
        : null,
    [analysis, datasetQuery, dataset],
  );

  // A query that fails still answers 202, with its error in the body.
  const error = build?.error ?? requestError ?? dataset?.error;
  return {
    settings: build?.settings,
    baseQuery: build?.baseQuery,
    analysis,
    query,
    rawSeries,
    isRunning: isFetching,
    error: error !== undefined ? getErrorMessage(error) : undefined,
  };
};
