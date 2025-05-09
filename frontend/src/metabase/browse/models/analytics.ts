import { trackSchemaEvent, trackSimpleEvent } from "metabase/lib/analytics";
import type { CardId } from "metabase-types/api";

export const trackModelClick = (modelId: CardId) =>
  trackSchemaEvent("browse_data", {
    event: "browse_data_model_clicked",
    model_id: modelId,
  });

export const trackNewModelInitiated = () =>
  trackSimpleEvent({
    event: "plus_button_clicked",
    triggered_from: "model",
  });
