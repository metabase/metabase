import type {
  ActivityModelObject,
  PopularItem,
  RecentItem,
} from "metabase-types/api";

export const createMockModelObject = (
  opts?: Partial<ActivityModelObject>,
): ActivityModelObject => ({
  name: "Orders",
  ...opts,
});

export const createMockRecentItem = (
  opts?: Partial<RecentItem>,
): RecentItem => ({
  model: "table",
  model_id: 1,
  model_object: createMockModelObject(),
  cnt: 1,
  max_ts: "2021-03-01T00:00:00.000Z",
  user_id: 1,
  ...opts,
});

export const createMockPopularItem = (
  opts?: Partial<PopularItem>,
): PopularItem => ({
  model: "table",
  model_id: 1,
  model_object: createMockModelObject(),
  ...opts,
});
