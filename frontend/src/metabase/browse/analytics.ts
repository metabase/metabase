import { trackSchemaEvent } from "metabase/lib/analytics";
import type { SearchResultId } from "metabase-types/api";

export const trackModelClick = (modelId: SearchResultId) =>
  trackSchemaEvent("browse_data", "1-0-0", {
    event: "browse_data_model_clicked",
    model_id: modelId,
  });

export const trackTableClick = (tableId: number) =>
  trackSchemaEvent("browse_data", "1-0-0", {
    event: "browse_data_table_clicked",
    table_id: tableId,
  });
