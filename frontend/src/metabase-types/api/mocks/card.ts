import type {
  ModerationReview,
  Card,
  UnsavedCard,
  VisualizationSettings,
  SeriesOrderSetting,
  StructuredDatasetQuery,
  NativeDatasetQuery,
  PublicCard,
} from "metabase-types/api";

import {
  createMockNativeDatasetQuery,
  createMockStructuredDatasetQuery,
} from "./query";

export const createMockCard = (opts?: Partial<Card>): Card => ({
  id: 1,
  name: "Question",
  description: null,
  display: "table",
  public_uuid: null,
  dataset_query: createMockStructuredDatasetQuery(),
  visualization_settings: createMockVisualizationSettings(),
  result_metadata: [],
  dataset: false,
  can_write: false,
  cache_ttl: null,
  collection_id: null,
  last_query_start: null,
  archived: false,
  ...opts,
});

export const createMockPublicCard = (
  opts?: Partial<PublicCard>,
): PublicCard => ({
  id: 1,
  name: "Question",
  description: null,
  display: "table",
  dataset_query: { type: "query" },
  visualization_settings: createMockVisualizationSettings(),
  ...opts,
});

export const createMockStructuredCard = (
  opts?: Partial<Card<StructuredDatasetQuery>>,
): Card<StructuredDatasetQuery> => ({
  ...createMockCard(opts),
  dataset_query: createMockStructuredDatasetQuery(opts?.dataset_query),
});

export const createMockNativeCard = (
  opts?: Partial<Card<NativeDatasetQuery>>,
): Card<NativeDatasetQuery> => ({
  ...createMockCard(opts),
  dataset_query: createMockNativeDatasetQuery(opts?.dataset_query),
});

export const createMockUnsavedCard = (
  opts?: Partial<UnsavedCard>,
): UnsavedCard => ({
  display: "table",
  dataset_query: createMockStructuredDatasetQuery(),
  visualization_settings: createMockVisualizationSettings(),
  ...opts,
});

export const createMockVisualizationSettings = (
  opts?: Partial<VisualizationSettings>,
): VisualizationSettings => ({
  ...opts,
});

export const createMockSeriesOrderSetting = ({
  name = "",
  key,
  enabled = true,
  ...opts
}: Partial<SeriesOrderSetting>): SeriesOrderSetting => ({
  name,
  key: key || name,
  enabled,
  ...opts,
});

export const createMockModerationReview = (
  opts?: Partial<ModerationReview>,
): ModerationReview => ({
  moderator_id: 1,
  status: "verified",
  created_at: "2015-01-01T20:10:30.200",
  most_recent: true,
  ...opts,
});
