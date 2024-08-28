import type { CardId } from "metabase-types/api";

export type TurnIntoModelClickedEvent = {
  event: "turn_into_model_clicked";
  target_id?: CardId;
};

export type NotebookNativePreviewShownEvent = {
  event: "notebook_native_preview_shown";
  target_id?: CardId;
};

export type SimpleEvent =
  | TurnIntoModelClickedEvent
  | NotebookNativePreviewShownEvent;
