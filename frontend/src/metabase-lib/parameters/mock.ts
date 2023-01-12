import { UiParameter } from "metabase-lib/parameters/types";

export const createMockUiParameter = (
  opts?: Partial<UiParameter>,
): UiParameter => ({
  id: "parameter-id",
  slug: "slug",
  name: "Name",
  type: "string/=",
  values_query_type: "list",
  values_source_type: null,
  values_source_config: {},
  ...opts,
});
