import * as Urls from "metabase/urls";
import { isConcreteTableId } from "metabase-types/api";

import type { MetricUrls } from "./types";

export const metricUrls: MetricUrls = {
  about: Urls.metricAbout,
  overview: Urls.metricOverview,
  query: Urls.metricQuery,
  dependencies: Urls.metricDependencies,
  history: Urls.metricHistory,
  database: (id) => Urls.browseDatabase({ id }),
  table: (databaseId, tableId) =>
    isConcreteTableId(tableId)
      ? Urls.table({ id: tableId })
      : Urls.tableRowsQuery(databaseId, tableId),
};
