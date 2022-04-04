import { ModelObject, PopularItem, RecentItem } from "metabase-types/api";

export const createMockModelObject = (
  opts?: Partial<ModelObject>,
): ModelObject => ({
  name: "Orders",
  ...opts,
});

export const createMockRecentView = (
  opts?: Partial<RecentItem>,
): RecentItem => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});

export const createMockPopularView = (
  opts?: Partial<PopularItem>,
): PopularItem => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});
