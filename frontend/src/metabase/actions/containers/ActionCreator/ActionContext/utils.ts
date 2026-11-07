import { NATIVE_QUERY_TEMPLATE } from "metabase-lib/v1/queries/templates";
import type { WritebackQueryAction } from "metabase-types/api";

import { getDefaultFormSettings } from "../../../utils";

export function createEmptyWritebackAction(): Partial<WritebackQueryAction> {
  return {
    name: "",
    description: null,
    type: "query",
    public_uuid: null,
    parameters: [],
    dataset_query: NATIVE_QUERY_TEMPLATE,
    visualization_settings: getDefaultFormSettings(),
  };
}
