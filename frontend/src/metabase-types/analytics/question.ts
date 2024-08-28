import type { CardId, DatabaseId } from "metabase-types/api";

export type NewQuestionSavedEvent = {
  event: "new_question_saved";
  question_id: CardId;
  database_id?: DatabaseId;
  type?: "simple_question" | "custom_question" | "native_question";
  method?: "from_scratch" | "existing_question";
  visualization_type?: string;
};

export type TurnIntoModelClickedEvent = {
  event: "turn_into_model_clicked";
  question_id: CardId;
};

export type NotebookNativePreviewShownEvent = {
  event: "notebook_native_preview_shown";
  question_id: CardId;
};

export type NotebookNativePreviewHiddenEvent = {
  event: "notebook_native_preview_hidden";
  question_id: CardId;
};

export type ColumnCombineViaShortcutEvent = {
  event: "column_combine_via_shortcut";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnCombineViaColumnHeaderEvent = {
  event: "column_combine_via_column_header";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnCombineViaPlusModalEvent = {
  event: "column_combine_via_plus_modal";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnCompareViaShortcutEvent = {
  event: "column_compare_via_shortcut";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnCompareViaColumnHeaderEvent = {
  event: "column_compare_via_column_header";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnCompareViaPlusModalEvent = {
  event: "column_compare_via_plus_modal";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnExtractViaShortcutEvent = {
  event: "column_extract_via_shortcut";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnExtractViaColumnHeaderEvent = {
  event: "column_extract_via_column_header";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type ColumnExtractViaPlusModalEvent = {
  event: "column_extract_via_plus_modal";
  question_id: CardId;
  database_id?: DatabaseId;
  custom_expressions_used: string[];
};

export type QuestionEvent =
  | NewQuestionSavedEvent
  | TurnIntoModelClickedEvent
  | NotebookNativePreviewShownEvent
  | NotebookNativePreviewHiddenEvent
  | ColumnCombineViaShortcutEvent
  | ColumnCombineViaColumnHeaderEvent
  | ColumnCombineViaPlusModalEvent
  | ColumnCompareViaShortcutEvent
  | ColumnCompareViaColumnHeaderEvent
  | ColumnCompareViaPlusModalEvent
  | ColumnExtractViaShortcutEvent
  | ColumnExtractViaColumnHeaderEvent
  | ColumnExtractViaPlusModalEvent;
