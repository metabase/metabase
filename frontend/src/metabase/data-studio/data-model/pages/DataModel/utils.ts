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

/**
 * Whether an Esc keypress is meant for this page's panels. Modals, menus and
 * popovers render outside the page and handle their own Esc, and inputs use
 * it to cancel an edit.
 */
export function isPageEscape(
  target: EventTarget | null,
  container: HTMLElement | null,
): boolean {
  if (!(target instanceof HTMLElement) || container == null) {
    return false;
  }
  if (target !== document.body && !container.contains(target)) {
    return false;
  }
  return !(
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.isContentEditable
  );
}
