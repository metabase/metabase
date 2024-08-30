type QuestionEventSchema = {
  event: string;
  question_id: number;
  type?: string | null;
  method?: string | null;
  visualization_type?: string | null;
  database_id?: number | null;
  custom_expressions_used?: string[] | null;
};

type ValidateEvent<
  T extends QuestionEventSchema &
    Record<Exclude<keyof T, keyof QuestionEventSchema>, never>,
> = T;

export type NewQuestionSavedEvent = ValidateEvent<{
  event: "new_question_saved";
  question_id: number;
  database_id: number | null;
  type: "simple_question" | "custom_question" | "native_question";
  method: "from_scratch" | "existing_question";
  visualization_type: string;
}>;

export type TurnIntoModelClickedEvent = ValidateEvent<{
  event: "turn_into_model_clicked";
  question_id: number;
}>;

export type NotebookNativePreviewShownEvent = ValidateEvent<{
  event: "notebook_native_preview_shown";
  question_id: number;
}>;

export type NotebookNativePreviewHiddenEvent = ValidateEvent<{
  event: "notebook_native_preview_hidden";
  question_id: number;
}>;

export type ColumnCombineViaShortcutEvent = ValidateEvent<{
  event: "column_combine_via_shortcut";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnCombineViaColumnHeaderEvent = ValidateEvent<{
  event: "column_combine_via_column_header";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnCombineViaPlusModalEvent = ValidateEvent<{
  event: "column_combine_via_plus_modal";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnCompareViaShortcutEvent = ValidateEvent<{
  event: "column_compare_via_shortcut";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnCompareViaColumnHeaderEvent = ValidateEvent<{
  event: "column_compare_via_column_header";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnCompareViaPlusModalEvent = ValidateEvent<{
  event: "column_compare_via_plus_modal";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnExtractViaShortcutEvent = ValidateEvent<{
  event: "column_extract_via_shortcut";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnExtractViaColumnHeaderEvent = ValidateEvent<{
  event: "column_extract_via_column_header";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

export type ColumnExtractViaPlusModalEvent = ValidateEvent<{
  event: "column_extract_via_plus_modal";
  question_id: number;
  database_id: number | null;
  custom_expressions_used: string[];
}>;

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
