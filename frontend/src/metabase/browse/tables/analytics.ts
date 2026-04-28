import { trackSchemaEvent, trackSimpleEvent } from "metabase/analytics";
import type { ConcreteTableId } from "metabase-types/api";

export const trackTableClick = (tableId: ConcreteTableId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_table_clicked",
    table_id: tableId,
  });

export const trackBrowseXRayClicked = () => {
  trackSimpleEvent({
    event: "x-ray_clicked",
    event_detail: "table",
    triggered_from: "browse_database",
  });
};

export const trackEditDataButtonClicked = (tableId: number) =>
  trackSimpleEvent({
    event: "edit_data_button_clicked",
    target_id: tableId,
    triggered_from: "table-browser",
  });
