import { ModelObject, PopularView, RecentView } from "metabase-types/api";

export const createMockModelObject = (
  opts?: Partial<ModelObject>,
): ModelObject => ({
  name: "Orders",
  ...opts,
});

export const createMockRecentView = (
  opts?: Partial<RecentView>,
): RecentView => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});

export const createMockPopularView = (
  opts?: Partial<PopularView>,
): PopularView => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});
