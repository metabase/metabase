import { trackSimpleEvent } from "metabase/lib/analytics";
export const trackAddDataEvent = (
  event: "csv_tab_clicked" | "sheets_tab_clicked" | "database_tab_clicked",
) => {
  trackSimpleEvent({
    event,
    triggered_from: "add-data-modal",
  });
};
