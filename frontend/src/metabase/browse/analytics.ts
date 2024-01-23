import { trackSchemaEvent } from "metabase/lib/analytics";

export const trackModelClick = (modelId: number) =>
  trackSchemaEvent("browse_data", "1-0-0", {
    event: "browse_data_model_click",
    model_id: modelId,
  });

export const trackTableClick = (tableId: number) =>
  trackSchemaEvent("browse_data", "1-0-0", {
    event: "browse_data_table_click",
    table_id: tableId,
  });
