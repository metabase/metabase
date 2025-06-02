import { trackSimpleEvent } from "metabase/lib/analytics";
export const trackAddDataEvent = (
  event:
    | "csv_upload_clicked"
    | "sheets_connection_clicked"
    | "database_setup_clicked",
) => {
  trackSimpleEvent({
    event,
    triggered_from: "add-data-modal",
  });
};
