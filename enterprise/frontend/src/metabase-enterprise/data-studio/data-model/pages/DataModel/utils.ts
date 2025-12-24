import * as Urls from "metabase/lib/urls";
import { isDataStudioTableMetadataTab } from "metabase/lib/urls/data-studio";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import type { ParsedRouteParams, RouteParams } from "./types";

export function parseRouteParams(params: RouteParams): ParsedRouteParams {
  return {
    databaseId: Urls.extractEntityId(params.databaseId),
    schemaName: params.schemaId
      ? getSchemaName(params.schemaId)
      : params.schemaId,
    tableId: Urls.extractEntityId(params.tableId),
    tab: isDataStudioTableMetadataTab(params.tab) ? params.tab : "field",
    fieldId: Urls.extractEntityId(params.fieldId),
  };
}
