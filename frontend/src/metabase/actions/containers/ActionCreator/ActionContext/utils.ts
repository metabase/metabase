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
      // @ts-expect-error — this is a valid unsaved query state
      // We could allow nulls in the query type, but that'd require a lot of changes
      database: null,
      native: {
        query: "",
      },
    },
    visualization_settings: getDefaultFormSettings(),
  };
}
