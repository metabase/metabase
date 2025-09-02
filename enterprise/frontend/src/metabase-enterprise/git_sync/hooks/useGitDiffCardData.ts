import { useMemo } from "react";

import { skipToken } from "metabase/api";
import { useGetAdhocQueryQuery } from "metabase/api/dataset";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import type { RawSeries } from "metabase-types/api";

export interface GitDiffCard {
  id?: number;
  name?: string;
  display?: string;
  database_id?: number;
  dataset_query?: any;
  visualization_settings?: any;
  result_metadata?: any;
}

export function useGitDiffCardData(gitCard: GitDiffCard | null | undefined) {
  const metadata = useSelector(getMetadata);

  const queryParams = useMemo(() => {
    if (!gitCard?.dataset_query) {
      return null;
    }

    const database =
      gitCard.database_id || gitCard.dataset_query?.database || null;

    if (!database) {
      console.warn("No database ID found for git diff card:", gitCard);
      return null;
    }

    return {
      ...gitCard.dataset_query,
      database,
      parameters: [],
    };
  }, [gitCard]);

  const {
    data: dataset,
    isLoading,
    error,
    isFetching,
  } = useGetAdhocQueryQuery(queryParams || skipToken);

  const series: RawSeries | null = useMemo(() => {
    if (!gitCard || !dataset?.data) {
      return null;
    }

    const cardForVisualization = {
      id: gitCard.id,
      name: gitCard.name || "Untitled Question",
      display: gitCard.display || "table",
      visualization_settings: gitCard.visualization_settings || {},
      dataset_query: gitCard.dataset_query,
      database_id: gitCard.database_id,
      result_metadata:
        dataset.data?.results_metadata || gitCard.result_metadata,
    };

    return [
      {
        card: cardForVisualization,
        started_at: dataset.started_at,
        data: dataset.data,
      },
    ];
  }, [gitCard, dataset]);

  return {
    series,
    isLoading: isLoading || isFetching,
    error,
    metadata,
    hasData: !!dataset?.data,
  };
}
