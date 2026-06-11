import { trackSimpleEvent } from "metabase/analytics";

export function trackSheetImportClick() {
  trackSimpleEvent({
    event: "sheets_import_by_url_clicked",
    triggered_from: "sheets-url-popup",
  });
}

export function trackSheetConnectionClick({
  from,
}: {
  from: "db-page" | "add-data-modal";
}) {
  trackSimpleEvent({
    event: "sheets_connection_clicked",
    triggered_from: from,
  });
}
