import { useMemo } from "react";

import type { MetricUrls } from "metabase/common/metrics/types";
import { useWorktreeId } from "metabase/common/worktrees";
import * as Urls from "metabase/urls";
import type { WorktreeId } from "metabase-types/api";

export function getDataStudioMetricUrls(
  worktreeId?: WorktreeId | null,
): MetricUrls {
  return {
    about: (cardId) => Urls.dataStudioMetric(cardId, { worktreeId }),
    overview: (cardId) => Urls.dataStudioMetricOverview(cardId, { worktreeId }),
    query: (cardId) => Urls.dataStudioMetricQuery(cardId, { worktreeId }),
    dimensions: (cardId) =>
      Urls.dataStudioMetricDimensions(cardId, { worktreeId }),
    dependencies: (cardId) =>
      Urls.dataStudioMetricDependencies(cardId, { worktreeId }),
    history: (cardId) => Urls.dataStudioMetricHistory(cardId, { worktreeId }),
    database: (databaseId) => Urls.dataStudioData({ databaseId }),
    table: (_databaseId, tableId) =>
      Urls.dataStudioTable(tableId, { worktreeId }),
  };
}

export function useDataStudioMetricUrls(): MetricUrls {
  const worktreeId = useWorktreeId();
  return useMemo(() => getDataStudioMetricUrls(worktreeId), [worktreeId]);
}
