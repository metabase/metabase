import type { ExplorationsState } from "metabase/redux/store/explorations";

export const createMockExplorationsState = (
  opts?: Partial<ExplorationsState>,
): ExplorationsState => {
  return {
    ...opts,
  };
};
