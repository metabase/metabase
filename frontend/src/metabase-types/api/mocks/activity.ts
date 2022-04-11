import { ModelObject, PopularItem, RecentItem } from "metabase-types/api";

export const createMockModelObject = (
  opts?: Partial<ModelObject>,
): ModelObject => ({
  name: "Orders",
  ...opts,
});

export const createMockRecentItem = (
  opts?: Partial<RecentItem>,
): RecentItem => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});

export const createMockPopularItem = (
  opts?: Partial<PopularItem>,
): PopularItem => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});
