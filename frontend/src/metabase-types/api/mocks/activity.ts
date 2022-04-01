import {
  PopularModelObject,
  PopularView,
  RecentModelObject,
  RecentView,
} from "metabase-types/api";

export const createMockRecentView = (
  opts?: Partial<RecentView>,
): RecentView => ({
  model: "table",
  model_object: createMockRecentModelObject(),
  ...opts,
});

export const createMockRecentModelObject = (
  opts?: Partial<RecentModelObject>,
): RecentModelObject => ({
  name: "Orders",
  ...opts,
});

export const createMockPopularView = (
  opts?: Partial<PopularView>,
): PopularView => ({
  model: "table",
  model_object: createMockPopularModelObject(),
  ...opts,
});

export const createMockPopularModelObject = (
  opts?: Partial<PopularModelObject>,
): PopularModelObject => ({
  name: "Orders",
  ...opts,
});
