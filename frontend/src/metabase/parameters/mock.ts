import { UiParameter } from "metabase/parameters/types";

export const createMockUiParameter = (
  opts?: Partial<UiParameter>,
): UiParameter => ({
  id: "parameter-id",
  slug: "slug",
  name: "Name",
  type: "string/=",
  ...opts,
});
