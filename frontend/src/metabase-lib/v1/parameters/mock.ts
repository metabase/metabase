import type * as Lib from "metabase-lib";
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

export const createMockParameterFieldInfo = (
  opts?: Partial<Lib.ParameterFieldInfo>,
): Lib.ParameterFieldInfo => ({
  id: 1,
  displayName: "Field",
  searchFieldDisplayName: "Field",
  isString: true,
  isBoolean: false,
  isDate: false,
  isNumeric: false,
  settings: null,
  hasFieldValues: "list",
  hasRemappedValues: false,
  ...opts,
});
