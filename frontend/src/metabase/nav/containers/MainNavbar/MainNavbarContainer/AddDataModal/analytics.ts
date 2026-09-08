import type { Engine } from "metabase-types/api";
import { trackSimpleEvent } from "metabase/analytics";
export const trackAddDataEvent = (
  event: "csv_tab_clicked" | "sheets_tab_clicked" | "database_tab_clicked",
) => {
  trackSimpleEvent({
    event,
    triggered_from: "add-data-modal",
  });
};

export const trackCSVFileInputSelect = () =>
  trackSimpleEvent({
    event: "csv_upload_clicked",
    triggered_from: "add-data-modal",
  });

export const trackDatabaseSelect = (engine: Engine["driver-name"]) => {
  trackSimpleEvent({
    event: "database_setup_selected",
    event_detail: engine,
    triggered_from: "add-data-modal",
  });
};
