import {
  ModerationReview,
  Card,
  UnsavedCard,
  VisualizationSettings,
} from "metabase-types/api";
import { createMockStructuredDatasetQuery } from "./query";

export const createMockCard = (opts?: Partial<Card>): Card => ({
  id: 1,
  name: "Question",
  description: null,
  display: "table",
  dataset_query: createMockStructuredDatasetQuery(),
  visualization_settings: createMockVisualizationSettings(),
  dataset: false,
  can_write: false,
  cache_ttl: null,
  last_query_start: null,
  ...opts,
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

export const createMockModerationReview = (
  opts?: Partial<ModerationReview>,
): ModerationReview => ({
  moderator_id: 1,
  status: "verified",
  created_at: "2015-01-01T20:10:30.200",
  most_recent: true,
  ...opts,
});
