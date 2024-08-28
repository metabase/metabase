/**
 *
 * Example of how to define events:
 *
 * export type TurnIntoModelClickedEvent = {
 *   event: "turn_into_model_clicked";
 *   target_id?: CardId;
 * };
 *
 * export type NotebookNativePreviewShownEvent = {
 *   event: "notebook_native_preview_shown";
 *   target_id?: CardId;
 * };
 *
 * export type SimpleEvent =
 *   | TurnIntoModelClickedEvent
 *   | NotebookNativePreviewShownEvent;
 */

export type SimpleEvent = never;
