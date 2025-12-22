import type { SearchModel } from "metabase-types/api";

export type SuggestionModel = SearchModel | "transform" | "user";

export type SuggestionPickerModalType =
  | "question-picker"
  | "unified-data-picker"
  | null;

export type SuggestionPickerViewMode =
  | "linkTo"
  | "embedQuestion"
  | "newQuestionType"
  | null;
