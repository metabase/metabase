import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { FieldId } from "metabase-types/api";

export type ParameterInfo = {
  parameter: UiParameter;
  filteredIds: FieldId[];
  filteringIds: FieldId[];
  isCompatible: boolean;
};
