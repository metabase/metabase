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
  cnt: 1,
  model_id: 1,
  max_ts: "2021-03-01T00:00:00.000Z",
  user_id: 1,
  ...opts,
});

export const createMockPopularItem = (
  opts?: Partial<PopularItem>,
): PopularItem => ({
  model: "table",
  model_object: createMockModelObject(),
  ...opts,
});
