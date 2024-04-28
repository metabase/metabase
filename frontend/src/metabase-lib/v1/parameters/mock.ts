import type { UiParameter } from "metabase-lib/v1/parameters/types";

export const createMockUiParameter = (
  opts?: Partial<UiParameter>,
): UiParameter => ({
  id: "parameter-id",
  slug: "slug",
  name: "Name",
  type: "string/=",
  ...opts,
});
