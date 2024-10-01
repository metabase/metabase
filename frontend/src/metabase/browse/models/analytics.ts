import { trackSchemaEvent } from "metabase/lib/analytics";
import type { CardId } from "metabase-types/api";

export const trackModelClick = (modelId: CardId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_model_clicked",
    model_id: modelId,
  });
