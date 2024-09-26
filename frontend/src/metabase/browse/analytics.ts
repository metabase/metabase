import { trackSchemaEvent } from "metabase/lib/analytics";
import type { CardId, ConcreteTableId } from "metabase-types/api";

export const trackModelClick = (modelId: CardId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_model_clicked",
    model_id: modelId,
  });

export const trackTableClick = (tableId: ConcreteTableId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_table_clicked",
    table_id: tableId,
  });
