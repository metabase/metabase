import type { ReactNode } from "react";

import type * as LibMetric from "metabase-lib/metric";
import type { Card, CardId, DatabaseId } from "metabase-types/api";

export interface DimensionWithDefinition {
  dimension: LibMetric.DimensionMetadata;
  definition: LibMetric.MetricDefinition;
}

export interface MetricUrls {
  about: (cardId: CardId) => string;
  overview: (cardId: CardId) => string;
  query: (cardId: CardId) => string;
  dependencies: (cardId: CardId) => string;
  caching: (cardId: CardId) => string;
  history: (cardId: CardId) => string;
  database?: (databaseId: DatabaseId) => string;
}

export interface MetricPageParams {
  cardId: string;
}

export interface MetricPageProps {
  params: MetricPageParams;
  urls?: MetricUrls;
  renderBreadcrumbs?: (card: Card) => ReactNode;
  showAppSwitcher?: boolean;
  showDataStudioLink?: boolean;
}
