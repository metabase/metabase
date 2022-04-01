import { RecentModelObject, RecentView } from "metabase-types/api";

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
