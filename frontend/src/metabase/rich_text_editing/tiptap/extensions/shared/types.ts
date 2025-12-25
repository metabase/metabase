import type { SearchModel } from "metabase-types/api";

export type SuggestionModel = SearchModel | "user";

export type SuggestionPickerModalType = "question-picker" | null;

export type SuggestionPickerViewMode =
  | "linkTo"
  | "embedQuestion"
  | "newQuestionType"
  | null;
