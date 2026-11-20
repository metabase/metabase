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
import { getAnalysisState } from "./analysis-state";
import { useStableQuery } from "./use-stable-value";

const STORED_SETTINGS = {};

type Analysis = {
  title: string;
  display: CardDisplayType;
  vizSettings: VisualizationSettings;
};

type AnalysisBuild =
  | { analysis: Analysis; query: Lib.Query; error?: never }
  | { analysis?: never; query?: never; error: unknown };

function buildAnalysis<K extends ProductAnalyticsKind>(
  kind: K,
  table: Table,
  metadataProvider: Lib.MetadataProvider,
): AnalysisBuild {
  try {
    const config = getAnalysisConfig(kind);
    const settings = computeAnalysisSettings(kind, { table }, STORED_SETTINGS);
    const analysisState = getAnalysisState({
      kind,
      settings,
      table,
      metadataProvider,
    });
    return {
      analysis: {
        title: config.getTitle(settings),
        display: config.getDisplay(settings),
        vizSettings: config.getVizSettings(settings),
      },
      query: Lib.buildProductAnalyticsQuery(analysisState),
    };
  } catch (error) {
    return { error };
  }
}

type UseAnalysisOptions<K extends ProductAnalyticsKind> = {
  kind: K;
  /** An event table that's set up for product analysis, once it's loaded. */
  table: Table | undefined;
};

type UseAnalysisResult = {
  /** Undefined without a table, and when the query can't be built. */
  analysis: Analysis | undefined;
  /** The query that runs. It keeps its identity while it's unchanged. */
  query: Lib.Query | undefined;
  rawSeries: RawSeries | null;
  isRunning: boolean;
  /** Why the query couldn't be built, or why its run failed. */
  error: string | undefined;
};

/** Builds the analysis's query with its default settings, and runs it. */
export const useAnalysis = <K extends ProductAnalyticsKind>({
  kind,
  table,
}: UseAnalysisOptions<K>): UseAnalysisResult => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const build = useMemo(
    () =>
      table !== undefined
        ? buildAnalysis(kind, table, metadataProvider)
        : undefined,
    [kind, table, metadataProvider],
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
    analysis,
    query,
    rawSeries,
    isRunning: isFetching,
    error: error !== undefined ? getErrorMessage(error) : undefined,
  };
};
