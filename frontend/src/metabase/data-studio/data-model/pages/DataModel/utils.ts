import * as Urls from "metabase/urls";
import { isDataStudioTableMetadataTab } from "metabase/urls/data-studio";
import { getSchemaName } from "metabase-lib/v1/metadata/utils/schema";

import type { ParsedRouteParams, RouteParams } from "./types";

export function parseRouteParams(params: RouteParams): ParsedRouteParams {
  return {
    databaseId: Urls.extractEntityId(params.databaseId),
    schemaName: params.schemaId
      ? getSchemaName(params.schemaId)
      : params.schemaId,
    tableId: Urls.extractEntityId(params.tableId),
    tab: isDataStudioTableMetadataTab(params.tab) ? params.tab : "details",
    fieldId: Urls.extractEntityId(params.fieldId),
  };
}
