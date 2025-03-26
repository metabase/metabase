import { trackSimpleEvent } from "metabase/lib/analytics";
import type { GsheetsConnectionClickedEvent } from "metabase-types/analytics";

export function trackSheetImportClick() {
  trackSimpleEvent({
    event: "sheets_import_by_url_clicked",
    triggered_from: "sheets-url-popup",
  });
}

export function trackSheetConnectionClick({
  from,
}: {
  from: GsheetsConnectionClickedEvent["triggered_from"];
}) {
  trackSimpleEvent({
    event: "sheets_connection_clicked",
    triggered_from: from,
  });
}
