import type { WritebackQueryAction } from "metabase-types/api";

import { getDefaultFormSettings } from "./../../../utils";

export function createEmptyWritebackAction(): Partial<WritebackQueryAction> {
  return {
    name: "",
    description: null,
    type: "query",
    public_uuid: null,
    parameters: [],
    dataset_query: {
      type: "native",
      database: null,
      native: {
        query: "",
      },
    },
    visualization_settings: getDefaultFormSettings(),
  };
}
